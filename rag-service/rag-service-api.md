# RAG Knowledge Service — API 文档

**基于 LlamaIndex + FastAPI + Qdrant 的知识处理服务**

---

## 目录

1. [概述](#概述)
2. [当前部署配置](#当前部署配置)
3. [接口一览](#接口一览)
4. [POST /index](#post-index) — 导入文档（URL/GitHub/本地路径）
5. [POST /index/upload](#post-indexupload) — 上传文件导入
6. [POST /index/stream](#post-indexstream) — SSE 流式导入
7. [POST /index/upload/stream](#post-indexuploadstream) — SSE 流式上传导入
8. [POST /query](#post-query) — 语义检索
9. [POST /classify](#post-classify) — 文本分类
10. [DELETE /knowledge/{point_id}](#delete-knowledgepoint_id) — 删除单条
11. [DELETE /knowledge/batch](#delete-knowledgebatch) — 批量删除
12. [取消与回退机制](#取消与回退机制)
13. [GET /config/llm](#get-configllm) — 查看 LLM 配置
14. [PUT /config/llm](#put-configllm) — 保存 LLM 配置
15. [GET /config/embed](#get-configembed) — 查看 Embedding 配置
16. [PUT /config/embed](#put-configembed) — 保存主 Embedding 配置
17. [PUT /config/embed/fallback](#put-configembedfallback) — 保存备用 Embedding 配置
18. [GET /config/embed/models](#get-configembedmodels) — 获取 Embedding 模型列表
19. [GET /config/llm/models](#get-configllmmodels) — 获取 LLM 模型列表
20. [GET /cache/stats](#get-cachestats) — Embedding 缓存统计
21. [GET /health](#get-health) — 健康检查
19. [Metadata Schema 参考](#metadata-schema-参考)
20. [变更记录](#变更记录)
21. [启动方式](#启动方式)

---

## 概述

RAG Knowledge Service 是一个基于 LlamaIndex 的知识处理服务，提供文档导入、语义检索和文本分类功能。

**数据流：**

```
文档 (URL/GitHub/本地) → Chunk分块 → LLM元数据分类 → Embedding向量化 → Qdrant存储
查询文本 → Embedding向量化 → Qdrant向量检索 + 元数据过滤 → 返回结果
```

**技术栈：**

| 组件 | 技术 |
|------|------|
| Web 框架 | FastAPI |
| 文档分块 | LlamaIndex SentenceSplitter |
| 向量数据库 | Qdrant (Docker) |
| LLM 分类 | 龙猫 LongCat-Flash-Chat / 智谱 GLM-4-Air（可切换） |
| Embedding | Gemini text-embedding-001（3072维） |

---

## 当前部署配置

LLM 和 Embedding 服务商可通过 API 手动配置（持久化到 `provider_config.json`），未配置时回退到 `.env`。服务商、模型、API Key 均支持运行时切换，无需重启。

### 基础设施

| 变量 | 说明 |
|------|------|
| `QDRANT_URL` | Qdrant 服务地址 |
| `QDRANT_COLLECTION` | Qdrant 集合名称 |
| `CHUNK_SIZE` | 分块大小 |
| `CHUNK_OVERLAP` | 分块重叠 |

### LLM 可用服务商（`PUT /config/llm`）

| ID | 名称 | 模型示例 |
|----|------|----------|
| `openai` | OpenAI | gpt-4o / gpt-4o-mini |
| `deepseek` | DeepSeek | deepseek-chat / deepseek-reasoner |
| `gemini` | Gemini | gemini-2.5-flash |
| `zhipu` | 智谱 | glm-4-air / GLM-4.5-Air |
| `longcat` | 龙猫 | LongCat-Flash-Chat / LongCat-2.0-Preview |

### Embedding 可用服务商

**云服务商（`mode: "provider"`，需 API Key）：**

| ID | 名称 | 模型示例 | 备注 |
|----|------|----------|------|
| `openai` | OpenAI | text-embedding-3-large / text-embedding-3-small |
| `gemini` | Gemini | gemini-embedding-001 |
| `cloudflare` | Cloudflare | @cf/baai/bge-base-en-v1.5 / bge-large-en-v1.5 | **需要 Account ID** |
| `zhipu` | 智谱 | embedding-2 / embedding-3 |

**本地部署（`mode: "local"`，用户填写 URL，无配额限制）：**

| ID | 名称 | 推荐模型 |
|----|------|----------|
| `ollama` | Ollama (本地/远程) | nomic-embed-text (768d) / bge-m3 (1024d) / mxbai-embed-large (1024d) |
| `lmstudio` | LM Studio (本地/远程) | 在 LM Studio 中加载的任意 embedding 模型 |
| `custom_openai` | 自定义 OpenAI 兼容 | 任意 OpenAI-compatible 服务 (TEI / vllm / LocalAI 等) |

> 本地模式 `local_url` 示例：`http://192.168.1.100:11434/v1`（Ollama）、`http://10.0.0.5:1234/v1`（LM Studio）

---

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/index` | 导入文档（URL / GitHub / 本地路径），同步返回结果 |
| POST | `/index/upload` | 上传文件导入，同步返回结果 |
| POST | `/index/stream` | **SSE 流式**导入文档，实时推送 5 步进度 |
| POST | `/index/upload/stream` | **SSE 流式**上传文件导入，实时推送 5 步进度 |
| POST | `/query` | 语义检索 + 元数据过滤 |
| POST | `/classify` | 文本 → LLM 分类 → metadata JSON |
| DELETE | `/knowledge/{point_id}` | 按 ID 删除单条 chunk |
| DELETE | `/knowledge/{point_id}` | 按 ID 删除单条 chunk |
| DELETE | `/knowledge/batch` | 批量删除（按 batch_id / source / domain / project_id / ids） |
| GET | `/config/llm` | 查看 LLM 配置 + 可用服务商列表 |
| PUT | `/config/llm` | 保存 LLM 服务商/模型/API Key |
| GET | `/config/embed` | 查看 Embedding 配置 + 可用服务商列表 |
| PUT | `/config/embed` | 保存**主** Embedding 服务商/模型/API Key |
| PUT | `/config/embed/fallback` | 保存**备用** Embedding 配置（独立，不影响主配置） |
| PUT | `/config/embed/toggle` | **一键开关**，启用/关闭本地 Embedding |
| GET | `/config/llm/models` | 独立获取 LLM 模型列表（不修改配置） |
| GET | `/config/embed/models` | 独立获取 Embedding 模型列表（不修改配置） |
| GET | `/cache/stats` | Embedding LRU 缓存统计 |
| GET | `/health` | 健康检查 |

---

## POST /index

导入文档，自动完成 chunk 分块 → LLM 元数据分类 → embedding 向量化 → Qdrant 存储。

**每次调用只消耗 1 次 LLM 调用（整篇文档分类一次，所有 chunk 共用元数据）**。

### 请求

**Content-Type:** `application/json`

```json
{
  "source": "https://raw.githubusercontent.com/gin-gonic/gin/master/README.md",
  "source_type": "url"
}
```

**source_type 说明：**

| 值 | 说明 | source 示例 |
|----|------|-------------|
| `url` | 网页 / Raw 文件 URL（支持省略 https:// 前缀，自动补全） | `raw.githubusercontent.com/gin-gonic/gin/master/README.md` |
| `github` | GitHub blob URL（自动转为 raw URL，支持省略 https:// 前缀） | `github.com/gin-gonic/gin/blob/master/context.go` |
| `github_repo` | **GitHub 仓库（克隆全部源码文件导入）** | `github.com/gin-gonic/gin` |
| `filepath` | 服务器本地文件绝对路径 | `/root/documents/my-file.py` |

### 请求示例

**URL 导入（可用 Swagger 预设值直接测试）：**

```bash
curl -X POST http://172.29.84.122:8000/index \
  -H "Content-Type: application/json" \
  -d '{"source":"https://raw.githubusercontent.com/gin-gonic/gin/master/README.md","source_type":"url"}'
```

**GitHub 导入（带 https://）：**

```bash
curl -X POST http://172.29.84.122:8000/index \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin/blob/master/context.go","source_type":"github"}'
```

**GitHub 导入（省略 https://，自动补全）：**

```bash
curl -X POST http://172.29.84.122:8000/index \
  -H "Content-Type: application/json" \
  -d '{"source":"github.com/gin-gonic/gin/blob/master/context.go","source_type":"github"}'
```

**本地文件导入：**

```bash
curl -X POST http://172.29.84.122:8000/index \
  -H "Content-Type: application/json" \
  -d '{"source":"/root/documents/my-file.py","source_type":"filepath"}'
```

**GitHub 仓库导入（克隆全部源码）：**

```bash
curl -X POST http://172.29.84.122:8000/index \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin","source_type":"github_repo"}'
```

> `github_repo` 流程：`git clone --depth 1` → 从 README 分类仓库（**1 次 LLM 调用**）→ 遍历源码文件 → 扩展名推断语言 → Embedding 后存入 Qdrant → 删除克隆。排除 .git、vendor、node_modules 等目录和二进制文件。

### 响应

**200 OK：**

```json
{
  "status": "ok",
  "indexed_count": 1,
  "chunk_count": 14
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定为 `"ok"` |
| `indexed_count` | int | 处理的源文档数量 |
| `chunk_count` | int | 实际索引的 chunk 数量 |

**错误响应：**

```json
// 404 — 文件未找到
{"detail": "File not found: /path/to/missing.md"}

// 500 — 索引失败
{"detail": "Indexing failed: Request URL is missing an 'http://' or 'https://' protocol."}
```

> 上面 500 错误已修复：现在 URL 省略 `https://` 前缀时会自动补全。

---

## POST /index/upload

上传本地文件，自动完成 chunk 分块 → LLM 元数据分类 → embedding 向量化 → Qdrant 存储。

**支持的文件格式：** `.md` `.py` `.go` `.java` `.rs` `.ts` `.js` `.txt` `.json` `.yaml` `.toml` 等 UTF-8 文本文件。

### 请求

**Content-Type:** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | file | 要上传的文本文件（UTF-8 编码） |

### 请求示例

**curl：**

```bash
curl -X POST http://172.29.84.122:8000/index/upload \
  -F "file=@/path/to/my-file.go"
```

**Python：**

```python
import requests

with open("my-file.go", "rb") as f:
    resp = requests.post(
        "http://172.29.84.122:8000/index/upload",
        files={"file": ("my-file.go", f, "text/plain")},
    )
print(resp.json())
```

### 响应

**200 OK：**

```json
{
  "status": "ok",
  "indexed_count": 1,
  "chunk_count": 4
}
```

**400 — 非 UTF-8 文件：**

```json
{"detail": "File is not UTF-8 text"}
```

---

## POST /index/stream

SSE (Server-Sent Events) 流式导入文档，实时推送处理进度。适合前端展示导入进度条。

**Content-Type:** `application/json`（请求）/ `text/event-stream`（响应）

### 请求

```json
{
  "source": "https://github.com/gin-gonic/gin",
  "source_type": "github"
}
```

字段同 `/index`。

### 响应（SSE 事件流）

每个事件为一行 `data: <JSON>`，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `step` | string | 当前步骤：`fetching` / `chunking` / `classifying` / `embedding` / `storing` / `done` / `error` |
| `progress` | int | 进度百分比 0-100 |
| `message` | string | 中文步骤描述 |
| `meta` | object | **仅 classifying 步骤**，分类结果（domain/language/framework/type/topic/tags） |

### SSE 事件流示例

```
data: {"step":"fetching","progress":5,"message":"正在获取文档..."}

data: {"step":"fetching","progress":20,"message":"文档获取成功 (11756 字符)"}

data: {"step":"chunking","progress":25,"message":"正在分块..."}

data: {"step":"chunking","progress":40,"message":"分块完成，共 5 个 chunk"}

data: {"step":"classifying","progress":45,"message":"LLM 正在分类..."}

data: {"step":"classifying","progress":60,"message":"分类完成","meta":{"domain":"Backend","language":"Go","framework":"Gin","type":"Tutorial","topic":"gin-web-framework","tags":["gin","go","web-framework"]}}

data: {"step":"embedding","progress":65,"message":"正在向量化..."}

data: {"step":"embedding","progress":80,"message":"向量化完成 (5 个向量)"}

data: {"step":"storing","progress":85,"message":"正在写入 Qdrant..."}

data: {"step":"storing","progress":95,"message":"已写入 5 条记录"}

data: {"step":"done","progress":100,"message":"导入完成，共 5 个 chunk"}
```

### 5 步管道

```
fetching          chunking        classifying       embedding         storing           done
  (0-20%)    →    (20-40%)   →    (40-60%)    →    (60-80%)    →    (80-95%)    →    (100%)
 获取文档          分块处理          LLM 分类         向量化            写入 Qdrant        完成
```

### 前端使用示例

```javascript
const response = await fetch('/index/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'https://github.com/gin-gonic/gin', source_type: 'github' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      console.log(`${event.step}: ${event.progress}% - ${event.message}`);
      // 更新进度条 UI
    }
  }
}
```

### 请求示例

```bash
curl -N -X POST http://172.29.84.122:8000/index/stream \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin","source_type":"github"}'
```

---

## POST /index/upload/stream

SSE 流式上传文件导入，实时推送处理进度。

**Content-Type:** `multipart/form-data`（请求）/ `text/event-stream`（响应）

### 请求

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | file | 要上传的文本文件（UTF-8 编码） |

### 响应

SSE 事件流，格式同 `/index/stream`（跳过 fetching 阶段直接从 chunking 开始）。

### 请求示例

```bash
curl -N -X POST http://172.29.84.122:8000/index/upload/stream \
  -F "file=@my-file.go"
```

---

## POST /query

语义检索，支持元数据字段过滤。

### 请求

**Content-Type:** `application/json`

```json
{
  "query": "How to handle JWT authentication in Go?",
  "filters": {
    "domain": "Backend",
    "language": "Go",
    "framework": null,
    "type": null,
    "topic": null,
    "tags": null,
    "project_id": null
  },
  "top_k": 5
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 查询文本（自然语言） |
| `filters` | object | 否 | 元数据过滤条件，**所有字段可选** |
| `filters.domain` | string | 否 | 技术领域：Android / Backend / Database / Frontend / DevOps |
| `filters.language` | string | 否 | 编程语言：Kotlin / Java / Python / Go / SQL / TypeScript / Rust / Swift |
| `filters.framework` | string | 否 | 框架：Jetpack / Spring / Gin / Flask / FastAPI / Django / React / Vue / Next.js / Kubernetes / Terraform / None |
| `filters.type` | string | 否 | 内容类型：API / Tutorial / Example / Concept |
| `filters.topic` | string | 否 | 细粒度主题 |
| `filters.tags` | string[] | 否 | 标签过滤（命中任一即匹配） |
| `filters.project_id` | string | 否 | 项目 ID（多项目隔离） |
| `top_k` | int | 否 | 返回结果数量（默认 10，最大 100） |

**仅查询（无过滤条件）：**

```json
{
  "query": "PostgreSQL connection pool best practices",
  "top_k": 10
}
```

### 请求示例

```bash
curl -X POST http://172.29.84.122:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How to handle JWT authentication in Gin?","filters":{"domain":"Backend","language":"Go"},"top_k":3}'
```

### 响应

**200 OK：**

```json
{
  "results": [
    {
      "id": "019e29f0-44b0-76c4-9f50-e6a8838b31e3",
      "content": "func AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader(\"Authorization\")\n        ...",
      "metadata": {
        "domain": "Backend",
        "language": "Go",
        "framework": "Gin",
        "type": "API",
        "topic": "jwt-auth-middleware",
        "tags": ["middleware", "jwt", "authentication", "gin", "go"],
        "source": "https://github.com/example/proj-api",
        "version": "1.0.0",
        "status": "published",
        "project_id": null
      },
      "score": 0.945312,
      "created_at": "2026-05-15T04:40:49.230133+00:00",
      "updated_at": "2026-05-15T04:40:49.230133+00:00"
    }
  ],
  "count": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `results[].id` | string | UUID v7 唯一标识符 |
| `results[].content` | string | 匹配的 chunk 内容 |
| `results[].metadata` | object | 结构化分类元数据（符合 KnowledgeItem Schema） |
| `results[].score` | float | 余弦相似度（0~1，越高越相关） |
| `results[].created_at` | string\|null | 创建时间（ISO 8601） |
| `results[].updated_at` | string\|null | 更新时间（ISO 8601） |
| `count` | int | 返回结果数量 |

---

## POST /classify

输入任意文本 → LLM 分类 → 输出符合 KnowledgeItem Schema 的结构化 metadata JSON。

### 请求

**Content-Type:** `application/json`

```json
{
  "text": "func AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader(\"Authorization\")\n        if token == \"\" {\n            c.AbortWithStatusJSON(401, gin.H{\"error\": \"missing token\"})\n            return\n        }\n        c.Next()\n    }\n}"
}
```

### 请求示例

```bash
curl -X POST http://172.29.84.122:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text":"Kotlin coroutines provide a way to write asynchronous code in a sequential style."}'
```

### 响应

**200 OK：**

```json
{
  "metadata": {
    "domain": "Android",
    "language": "Kotlin",
    "framework": "Jetpack",
    "type": "Concept",
    "topic": "coroutine-exception-handling",
    "tags": ["coroutine", "exception", "async", "kotlin"],
    "source": null,
    "version": "1.0.0",
    "status": "published",
    "project_id": null
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `domain` | string | 是 | 技术领域 |
| `language` | string | 是 | 编程语言 |
| `framework` | string | 是 | 框架 / "None" |
| `type` | string | 是 | 内容类型 |
| `topic` | string | 是 | 细粒度主题（小写连字符） |
| `tags` | string[] | 是 | 自由标签（1-20 个） |
| `source` | string\|null | 否 | 原始出处 URL |
| `version` | string | 否 | 版本号（默认 `"1.0.0"`） |
| `status` | string | 否 | 状态（默认 `"published"`） |
| `project_id` | string\|null | 否 | 项目 ID |

---

## DELETE /knowledge/{point_id}

按 UUID 删除单条知识条目。

### 请求

```bash
curl -X DELETE http://172.29.84.122:8000/knowledge/019e2b11-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 响应

```json
{"status": "ok", "deleted_count": 1}
```

404:

```json
{"detail": "Point not found: <id>"}
```

---

## DELETE /knowledge/batch

批量删除知识条目，支持多种过滤条件。

### 请求

**Content-Type:** `application/json`

```json
{
  "batch_id": "019e2b11-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "source": null,
  "domain": null,
  "project_id": null,
  "ids": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `batch_id` | string | 按批次 ID 删除整批（SSE 首个事件或同步响应中获取） |
| `source` | string | 按 source URL 匹配删除 |
| `domain` | string | 按 domain 过滤删除 |
| `project_id` | string | 按 project_id 过滤删除 |
| `ids` | string[] | 按显式 ID 列表删除 |

**至少提供一个过滤条件。**

### 请求示例

```bash
# 按 batch_id 删除（取消导入）
curl -X DELETE http://172.29.84.122:8000/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"019e2b11-b8a4-72aa-abff-52c4edefd9f4"}'

# 按 source 删除
curl -X DELETE http://172.29.84.122:8000/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"source":"https://raw.githubusercontent.com/gin-gonic/gin/master/README.md"}'

# 按 ID 列表删除
curl -X DELETE http://172.29.84.122:8000/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"ids":["id-1","id-2","id-3"]}'
```

### 响应

```json
{"status": "ok", "deleted_count": 5}
```

404:

```json
{"detail": "No matching points found"}
```

---

## 取消与回退机制

SSE 流式导入支持前端取消并回退已写入的数据：

```
1. 前端发起 POST /index/stream
2. SSE 首个事件包含 batch_id:
   data: {"step":"batch","progress":0,"message":"batch_id=xxx","meta":{"batch_id":"xxx"}}
3. 用户点击取消 → 前端 AbortController.abort()
4. 前端调用 DELETE /knowledge/batch 传入 batch_id
5. 该批次所有已写入 chunk 被物理删除
```

---

## DELETE /knowledge/{point_id}

按 UUID 删除单条知识条目。

```bash
curl -X DELETE http://172.29.84.122:8000/knowledge/019e2b11-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**200 OK：**

```json
{"status": "ok", "deleted_count": 1}
```

**404：**

```json
{"detail": "Point not found: <id>"}
```

---

## DELETE /knowledge/batch

批量删除，支持按 `batch_id` / `source` / `domain` / `project_id` / `ids` 过滤。至少提供一个条件。

### 请求

```json
{
  "batch_id": "019e2b11-xxxx",
  "source": "https://...",
  "domain": "Backend",
  "project_id": null,
  "ids": ["id1", "id2"]
}
```

### 请求示例

```bash
curl -X DELETE http://172.29.84.122:8000/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"019e2b11-b8a4-72aa-abff-52c4edefd9f4"}'
```

**200 OK：**

```json
{"status": "ok", "deleted_count": 5}
```

---

## 取消与回退机制

SSE 流式导入支持前端取消并回退已写入数据：

```
1. POST /index/stream → SSE 首个事件返回 batch_id
2. 用户取消 → AbortController.abort()
3. DELETE /knowledge/batch {batch_id} → 整批删除
```

---

## GET /config/llm

查看当前 LLM 配置（API Key 脱敏），并**自动通过 API Key 从服务商获取可用模型列表**。

```bash
curl http://172.29.84.122:8000/config/llm
```

### 响应 — 动态获取成功

```json
{
  "provider": "longcat",
  "model": "LongCat-Flash-Chat",
  "api_key": "ak_23f4H***",
  "base_url": "https://api.longcat.chat/openai/v1",
  "available_providers": [...],
  "dynamic_models": {
    "source": "dynamic",
    "models": ["LongCat-2.0-Preview", "LongCat-Flash-Lite", "LongCat-Flash-Chat", ...],
    "error": null
  }
}
```

### 响应 — 获取失败（Key 无效或网络问题）

```json
{
  "dynamic_models": {
    "source": "fallback",
    "models": ["LongCat-Flash-Chat", "LongCat-Flash-Thinking", ...],
    "error": "获取失败: Error code: 401 - invalid_api_key"
  }
}
```

| `dynamic_models.source` | 说明 |
|--------------------------|------|
| `dynamic` | 从服务商 API 实时获取的模型列表 |
| `fallback` | 获取失败，展示预设模型列表（仅供参考） |
| `error` | 完全失败（如服务商不支持） |

---

## PUT /config/llm

手动配置 LLM 服务商。模型名**支持手动输入任意字符串**，不限制预设列表。保存到 `provider_config.json`，即时生效。

### 请求

```json
{"provider": "zhipu", "model": "glm-4-air", "api_key": "your-key"}
```

```bash
# 使用动态获取到的模型
curl -X PUT http://172.29.84.122:8000/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider":"zhipu","model":"glm-4-air","api_key":"your-key"}'

# 手动输入任意模型名
curl -X PUT http://172.29.84.122:8000/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","model":"my-fine-tuned-model","api_key":"sk-xxx"}'
```

---

## GET /config/embed

查看当前 Embedding 配置（脱敏），同样**自动从服务商获取可用 Embedding 模型列表**。

```bash
curl http://172.29.84.122:8000/config/embed
```

### 响应

```json
{
  "provider": "gemini",
  "model": "gemini-embedding-001",
  "api_key": "AIza***",
  "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "fallback_provider": "zhipu",
  "fallback_model": "embedding-2",
  "fallback_api_key": "0b91***",
  "available_providers": [...],
  "dynamic_models": {
    "source": "dynamic",
    "models": ["models/gemini-embedding-001", "models/gemini-embedding-2-preview", "models/gemini-embedding-2"],
    "error": null
  },
  "warning": null,
  "cache_cleared": false
}
```

---

## PUT /config/embed

配置 Embedding。支持两种模式：`provider`（云服务商）和 `local`（本地/自部署）。

### 请求 — 云服务商模式

```json
{
  "mode": "provider",
  "provider": "gemini",
  "model": "gemini-embedding-001",
  "api_key": "your-key",
  "cf_account_id": null,
  "fallback_provider": "zhipu",
  "fallback_model": "embedding-2",
  "fallback_api_key": "your-fallback-key"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | string | 是 | 服务商 ID |
| `model` | string | 是 | Embedding 模型名称（任意字符串） |
| `api_key` | string | 是 | API Key（Cloudflare 则为 **API Token**） |
| `cf_account_id` | string | 条件 | **仅 Cloudflare 必填**。Account ID 见 CF Dashboard 右侧 |
| `fallback_provider` | string | 否 | 备用服务商 ID |
| `fallback_model` | string | 否 | 备用模型名称 |
| `fallback_api_key` | string | 否 | 备用 API Key |

### Cloudflare 配置示例

```bash
curl -X PUT http://172.29.84.122:8000/config/embed \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "cloudflare",
    "model": "@cf/baai/bge-base-en-v1.5",
    "api_key": "your-cf-api-token",
    "cf_account_id": "your-cf-account-id"
  }'
```

### 响应 — 模型未变更

```json
{"provider":"gemini","model":"gemini-embedding-001","cf_account_id":"","cache_cleared":true,"warning":null}
```

### 响应 — 模型已变更（如 gemini → zhipu）

```json
{
  "provider": "zhipu",
  "model": "embedding-2",
  "cf_account_id": "",
  "cache_cleared": true,
  "warning": "Embedding 模型已从 gemini:gemini-embedding-001 切换为 zhipu:embedding-2..."
}
```

| 新增字段 | 说明 |
|----------|------|
| `cf_account_id` | 脱敏显示。仅 Cloudflare 有值 |
| `warning` | 模型变更时提示旧向量不兼容，需重建索引 |
| `cache_cleared` | 始终为 `true`，确保后续查询使用新模型 |

### 请求 — 本地部署模式

```json
{
  "mode": "local",
  "provider": "ollama",
  "model": "nomic-embed-text",
  "api_key": "",
  "local_url": "http://192.168.1.100:11434/v1"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | `"provider"` 或 `"local"` |
| `provider` | string | local 时选填 | 本地服务商标识：ollama / lmstudio / custom_openai |
| `model` | string | 是 | 模型名（手动输入或从 `/config/embed/models` 获取） |
| `local_url` | string | local 时必填 | 本地服务地址，如 `http://192.168.1.100:11434/v1` |
| `api_key` | string | local 时可选 | 预留字段，本地服务通常无需 Key |

```bash
# Ollama 远程服务器
curl -X PUT http://172.29.84.122:8000/config/embed \
  -H "Content-Type: application/json" \
  -d '{"mode":"local","provider":"ollama","model":"nomic-embed-text","local_url":"http://192.168.1.100:11434/v1"}'

# LM Studio
curl -X PUT http://172.29.84.122:8000/config/embed \
  -H "Content-Type: application/json" \
  -d '{"mode":"local","provider":"lmstudio","model":"bge-m3","local_url":"http://10.0.0.5:1234/v1"}'
```

---

## PUT /config/embed/fallback

**独立**保存备用 Embedding Provider。不影响主 Provider 配置。

### 请求

```json
{
  "provider": "zhipu",
  "model": "embedding-2",
  "api_key": "your-key"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | string | 否 | 备用服务商 ID（传空串 = 清空） |
| `model` | string | 否 | 备用模型名称 |
| `api_key` | string | 否 | 备用 API Key |

> 三个字段都是可选的——不传 = 保留旧值，传空串 = 清空。

```bash
# 配置备用
curl -X PUT http://172.29.84.122:8000/config/embed/fallback \
  -H "Content-Type: application/json" \
  -d '{"provider":"zhipu","model":"embedding-2","api_key":"your-key"}'

# 清空备用
curl -X PUT http://172.29.84.122:8000/config/embed/fallback \
  -H "Content-Type: application/json" \
  -d '{"provider":"","model":"","api_key":""}'
```

---

## GET /config/llm/models

独立获取 LLM 模型列表（纯查询，**不修改任何配置**）。

```bash
# 获取当前 LLM Provider 的模型
curl http://172.29.84.122:8000/config/llm/models

# 获取指定 Provider 的模型
curl http://172.29.84.122:8000/config/llm/models?provider=gemini
```

```json
{"source":"dynamic","models":["gpt-4o","gpt-4o-mini",...],"error":null}
```

---

## GET /config/embed/models

独立获取 Embedding 模型列表（**不修改配置**）。

```bash
# 主 Provider
curl http://172.29.84.122:8000/config/embed/models

# 备用 Provider
curl "http://172.29.84.122:8000/config/embed/models?fallback=true"

# 指定 Provider
curl http://172.29.84.122:8000/config/embed/models?provider=openai
```

```json
{"source":"dynamic","models":["text-embedding-3-large","text-embedding-3-small"],"error":null}
```

---

## GET /cache/stats

Embedding LRU 缓存命中率。

```bash
curl http://172.29.84.122:8000/cache/stats
```

```json
{"size": 42, "hits": 156, "misses": 23, "max": 2048}
```

---

## GET /health

```bash
curl http://172.29.84.122:8000/health
```

```json
{"status": "healthy"}
```

---

## Metadata Schema 参考

严格遵循 `data-model.md` 定义的 KnowledgeItem Schema：

```json
{
  "metadata": {
    "domain": "Backend",
    "language": "Go",
    "framework": "Gin",
    "type": "API",
    "topic": "jwt-auth-middleware",
    "tags": ["middleware", "jwt", "authentication", "gin", "go"],
    "source": "https://github.com/example/proj-api",
    "version": "1.0.0",
    "status": "published",
    "project_id": null
  }
}
```

### 必填字段及枚举值

| 字段 | 枚举值 |
|------|--------|
| `domain` | `Android` `Backend` `Database` `Frontend` `DevOps` |
| `language` | `Kotlin` `Java` `Python` `Go` `SQL` `TypeScript` `Rust` `Swift` |
| `framework` | `Jetpack` `Spring` `Gin` `Flask` `FastAPI` `Django` `React` `Vue` `Next.js` `Kubernetes` `Terraform` `None` |
| `type` | `API` `Tutorial` `Example` `Concept` |
| `topic` | 自由文本，1-128 字符，小写连字符 |
| `tags` | 字符串数组，1-20 个，每个 ≤64 字符 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | string (uri) | 原始出处 URL |
| `version` | string | 语义版本号，如 `1.0.0` |
| `status` | string | `draft` / `published` / `archived` |
| `project_id` | string (uuid) | 多项目隔离 ID |

---

## 变更记录

### v1.9.1 (2026-05-16)

**重要修复 — 增量存储 + SSE 心跳防超时：**
- 嵌入阶段改为**分批增量存储**（每 20 chunk 嵌入完立刻写入 Qdrant），不再等全部完成
- SSE 嵌入阶段每 25s 发送**心跳事件**（`step: "embedding"`），防止 nginx/网关因长时间无数据断开
- SSE 事件新增 `meta.done` `meta.total` `meta.elapsed_s` `meta.eta_s`，前端可展示预估剩余时间
- 修复大仓库导入时数据全部丢失的 bug（此前嵌入完成但 upsert 未执行即被中断）

### v1.9.0 (2026-05-16)

**架构重构 — Embedding 分离为 Provider / Local 两种模式：**

- `mode: "provider"` — 云服务商（OpenAI / Gemini / Zhipu / Cloudflare），官方 base_url 自动填充，需 API Key
- `mode: "local"` — 本地/自部署（Ollama / LM Studio / 自定义 OpenAI 兼容），**用户手动填写 local_url**，API Key 可选
- 新增 3 个 local 类型 Provider：`ollama` `lmstudio` `custom_openai`
- `PUT /config/embed` 新增 `mode` `local_url` 字段；`GET` 响应同步新增
- 模型获取接口 `fetch_models()` 支持 local 模式（从用户提供的 URL 拉取模型列表）
- 禁用 OpenAI SDK 内置重试（`max_retries=0`），避免 429 时 30s+ 超时挂起
- **一键开关** `PUT /config/embed/toggle?enabled=true|false` — 启用本地时供应商自动失效，关闭自动恢复供应商
- `GET /config/embed` 新增 `use_local` 字段，前端据此展示开关状态
- Provider 列表新增 `type` 字段区分 `provider` / `local`

### v1.8.0 (2026-05-16)

**新特性 — Gitingest 智能 GitHub 仓库导入：**
- `github_repo` 导入改用 `gitingest` 库，替代手动 `git clone` + 文件后缀过滤
- Gitingest 自动：尊重 `.gitignore`、过滤二进制文件、提取目录树、合并输出
- 移除旧的手工 clone/walk 代码（`_clone_repo` `_EXT_TO_LANG` `_SKIP_DIRS` `_store_file` 等），代码量减少 40%
- 实测 gin-gonic/gin：972 chunks，正确分类 Backend/Go

### v1.7.2 (2026-05-16)

**Bug 修复 — Qdrant 3072 重建 + Fallback 同 Provider Key 继承 + 输入保护：**

- **Qdrant 重建**：768 维 → 3072 维（Cloudflare 测试残留修复）
- **Fallback 同 Provider 自动继承 Key**：备用与主 Provider 相同时 `fallback_api_key` 可为空，Embedder 运行时继承主 Key。JSON 存储层隔离不变。此前因 `fallback_api_key` 为空导致 `_fb_client` 未创建、429 时不切换。
- **超长输入分段**：超 `embed_max_chars`（默认 20k 字符）时按词边界切子块 → 分别嵌入 → 均值合并，不丢弃数据
- **模型名 `models/` 前缀剥离**：`fetch_models()` 清洗 Gemini 原生返回值 + 去重

### v1.7.1 (2026-05-16)

**优化 — API 错误消息携带服务商标识：**
- 所有 LLM / Embedding 异常统一带 `[LLM: 服务商 / 模型]` 或 `[Embedding: 服务商 / 模型]` 前缀
- 429 限流错误明确返回**服务商名称 + 余额不足提示 + 切换建议**
- Embedding 429 额外提示"若已配置备用 Provider 将自动切换"
- Cloudflare 认证失败/限流单独标注 `[Embedding: Cloudflare]`
- 修复 `classifier.py` 中异常包装打断 429 重试的 bug（重试在包装前执行）

### v1.7.0 (2026-05-15)

**新特性 — Cloudflare Workers AI Embedding 支持：**
- `embedder.py` 新增 Cloudflare AI 直连客户端（httpx），前端零改动
- 新增 `cf_account_id` 字段，仅 Cloudflare 需要
- Cloudflare LLM 不支持（API 格式不兼容）

**灾难级 Bug 修复 — Embedding 主/备配置数据串扰：**

这是 v1.5.0 引入的两个关联 Bug，会导致前端保存备用 Embedding 时误覆盖主配置、获取模型列表时触发副作用。

| 问题 | 根因 | 影响 |
|------|------|------|
| **模型获取耦合在配置保存里** | `GET /config/llm` 和 `GET /config/embed` 内嵌了 `fetch_models()` 调用。`PUT` 端点也在返回时自动拉模型列表。模型获取没有独立入口。 | 前端无法单独获取模型列表。每次查看配置都触发 API 调用。 |
| **主/备配置全量覆盖** | `PUT /config/embed` 的 `EmbedConfigRequest` 要求必传 `provider/model/api_key`（主配置），同时还携带 fallback 字段。`set_embed_config()` 全量覆写整个 embed 对象。 | 前端**只改 fallback 时**：必须同时传主配置字段，若传错则主配置丢失。**只改主配置时**：fallback 被空串覆盖。 |
| **空字符串和 env 回退冲突** | `get_embed_config()` 用 `or` 做回退，`"" or "env_val"` 返回 `"env_val"`。清空 fallback 后实际读到的仍是 env 值。 | 前端显示已清空，但运行时仍使用 env 里的旧 key。 |

**架构重构（v1.7.0 最终方案）：**

| 变更 | 说明 |
|------|------|
| **模型获取独立** | 新增 `GET /config/llm/models?provider=` 和 `GET /config/embed/models?provider=&fallback=`。纯查询，零副作用。 |
| **主/备彻底分离** | `PUT /config/embed` 只接受主 Provider 字段。新增 `PUT /config/embed/fallback` 独立管理备用配置。两者互不影响。 |
| **空值语义修复** | `get_embed_config()` / `get_llm_config()` 改为 `if key in cfg` 检查，区分"key 不存在"（回退 env）和"value 为空串"（已清空）。 |
| **合并改为 None 哨兵** | `set_embed_config()` 参数默认 `None`：`None`=保留旧值不变，`""`=明确清空。 |

### v1.6.0 (2026-05-15)

**优化 — LLM / Embedding 模型列表动态获取：**
- `GET /config/llm` 和 `GET /config/embed` 新增 `dynamic_models` 字段
- 自动用用户配置的 API Key 从服务商 API 实时拉取可用模型列表（`source: "dynamic"`）
- 获取失败时回退预设列表并返回错误原因（`source: "fallback"`）
- PUT 端点不再校验模型名是否在预设列表中，**允许手动输入任意模型名**
- 仅校验服务商是否支持该类型模型（如 LongCat 无 Embedding 模型会拒绝）

### v1.5.0 (2026-05-15)

**新特性 — 可配置 AI / Embedding 服务商：**
- **6 个内置服务商**：OpenAI / DeepSeek / Gemini / Cloudflare / 智谱 / 龙猫
- **`GET/PUT /config/llm`** / **`GET/PUT /config/embed`** — 配置持久化、即时生效
- **Embedding 切换保护**：模型变更时返回 warning + 自动清空缓存

### v1.4.0 (2026-05-15)

**新特性 — Embedding 缓存 + 双 Provider：**
- LRU 内存缓存（max 2048），相同查询零 API 调用
- 双 Provider 自动切换：主限流 → 备接管（429/5xx）
- 新增 `embedder.py` 统一管理

### v1.3.0 (2026-05-15)

**新特性 — DELETE 端点 + 取消/回退机制：**
- `DELETE /knowledge/{point_id}` + `DELETE /knowledge/batch`
- 所有导入自动生成 `batch_id`，SSE 首事件返回

### v1.2.0 (2026-05-15)

**新特性 — GitHub 仓库源码导入：**
- 新增 `source_type: "github_repo"` — `git clone --depth 1` 整个仓库，导入全部源码文件
- 仓库级分类：从 README 分类一次（**1 次 LLM 调用**），文件语言从扩展名推断
- 自动排除 `.git` `vendor` `node_modules` 等目录和二进制文件
- 导入完成后自动删除克隆目录
- 支持同步 (`/index`) 和 SSE 流式 (`/index/stream`) 两种模式

**优化 — 减少 LLM 调用：**
- 仓库导入：120+ 文件只需 1 次 LLM 调用（README 分类），而非 120 次

### v1.1.0 (2026-05-15)

**新特性 — SSE 流式导入：**
- 新增 `POST /index/stream` — SSE 流式导入文档，实时推送 5 步管道进度
- 新增 `POST /index/upload/stream` — SSE 流式上传文件导入
- 每步事件包含 `step`、`progress`（百分比）、`message`（中文描述）
- classifying 步骤附带 `meta` 分类结果（domain/language/framework/type/topic/tags）

**Bug 修复 — GitHub URL 解析：**
- 修复：GitHub 仓库级 URL（如 `github.com/owner/repo`）不再静默失败
- `_github_to_raw()` 现在支持 3 种 URL 格式：
  - `blob` URL → 原始文件
  - `tree` URL → README.md
  - `repo` URL → main/README.md（404 时自动回退 master）
- 无法识别的 GitHub URL 返回 400 明确错误信息
- URL 自动补全 `https://` 前缀

### v1.0.0 (2026-05-15)

- 初始版本：`/index` `/query` `/classify` `/health` 四个接口
- LlamaIndex 分块 + LLM 分类 + Gemini Embedding + Qdrant 存储
- 支持 LLM / Embedding 双 API 分离配置
- 整篇文档分类一次（所有 chunk 共享 metadata），减少 LLM 调用

---

## 启动方式

### 1. 前置依赖

- Python 3.11+
- Docker（用于运行 Qdrant）
- LLM API Key（龙猫 / 智谱 / OpenAI 兼容均可）
- Embedding API Key（Gemini 或其他）

### 2. 启动 Qdrant

```bash
docker run -d --name qdrant -p 6333:6333 -v qdrant_data:/qdrant/storage qdrant/qdrant
```

### 3. 安装依赖

```bash
cd rag-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. 配置 `.env`

```bash
cp .env.example .env
# 编辑 .env，至少配置 LLM_API_KEY 和 EMBED_API_KEY
```

### 5. 启动服务

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. 验证

- Swagger UI: [http://172.29.84.122:8000/docs](http://172.29.84.122:8000/docs)（推荐，可直接上传文件测试）
- ReDoc: [http://172.29.84.122:8000/redoc](http://172.29.84.122:8000/redoc)
- 健康检查: `curl http://172.29.84.122:8000/health`
- 文件上传: `curl -F "file=@your-file.go" http://172.29.84.122:8000/index/upload`

---

## 项目结构

```
rag-service/
├── main.py              # FastAPI 入口（中英文接口描述）
├── config.py            # 配置（LLM + Embedding 双 API 分离）
├── models.py            # Pydantic 请求/响应模型（含中文描述 + Swagger 示例）
├── classifier.py        # LLM 元数据分类器（内置 Prompt + 指数退避重试）
├── indexer.py           # 文档加载 → Chunk → 分类 → Embedding → Qdrant
├── retriever.py         # 向量检索 + 元数据过滤
├── requirements.txt     # Python 依赖
├── .env.example         # 环境变量模板
└── rag-service-api.md   # 本文档
```
