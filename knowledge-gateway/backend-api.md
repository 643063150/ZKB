# Knowledge Gateway — API 文档

**Go 网关服务，统一封装 Python RAG Service 的向量知识库能力**

---

## 概述

Knowledge Gateway 是 RAG Knowledge Service 的 Go 语言网关层，提供统一的 RESTful API 接口。

**数据流：**

```
Client → Knowledge Gateway (Go/Gin) → Python RAG Service (FastAPI) → Qdrant 向量数据库
```

**技术栈：**

| 组件 | 技术 |
|------|------|
| 网关框架 | Go 1.26 + Gin 1.10 |
| 后端服务 | Python FastAPI (LlamaIndex) |
| 向量数据库 | Qdrant (Docker) |
| Embedding | Gemini text-embedding-001 (3072维) |

**Base URL:** `http://172.29.84.122:8080`

---

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/knowledge/import` | 导入文档（URL / GitHub / 本地文件），同步返回结果 |
| POST | `/knowledge/import/stream` | **SSE 流式**导入文档，实时推送进度 + batch_id |
| POST | `/knowledge/upload` | 上传文件导入，同步返回结果 |
| POST | `/knowledge/upload/stream` | **SSE 流式**上传文件导入，实时推送进度 + batch_id |
| POST | `/knowledge/search` | 语义检索 + 元数据过滤，返回内容、分类元数据、相似度 |
| DELETE | `/knowledge/{id}` | 按 ID 删除单条 chunk |
| DELETE | `/knowledge/batch` | 批量删除（按 batch_id / source / domain / project_id / ids） |
| GET  | `/knowledge/stats` | 服务状态与数据统计 |
| GET  | `/knowledge/cache` | Embedding 缓存命中率统计 |
| GET  | `/knowledge/graph` | 知识图谱元数据聚合 |
| GET  | `/config/llm` | 查看 LLM 配置 + 可用服务商列表 |
| PUT  | `/config/llm` | 保存 LLM 服务商/模型/API Key |
| GET  | `/config/llm/models` | 获取 LLM 模型列表（纯查询，不修改配置） |
| GET  | `/config/embed` | 查看 Embedding 配置（主 + 备） |
| PUT  | `/config/embed` | **仅保存主** Embedding Provider |
| GET  | `/config/embed/models` | 获取 Embedding 模型列表（纯查询） |
| PUT  | `/config/embed/fallback` | **仅保存备用** Embedding Provider |
| PUT  | `/config/embed/toggle` | 切换 本地/供应商 Embedding |

---

## v1.7.0 BREAKING CHANGE — Embedding 配置拆分

### 修复的灾难级 Bug

**旧版问题：** `PUT /config/embed` 曾同时处理**主 Provider** 和**备用 Provider** 的所有字段。后端 merge 逻辑存在字段污染 bug：**保存备用 Provider 时可能覆盖主 Provider 的 API Key，反之亦然**。

### 修复方案 — 主/备强制分离

| 操作 | 旧端点 | 新端点 |
|------|-------|--------|
| 保存主 Provider | `PUT /config/embed`(含 fallback) | `PUT /config/embed` (**仅主**) |
| 保存备用 Provider | 同上 | `PUT /config/embed/fallback` (**仅备用**) |
| 获取 LLM 模型 | 嵌在 config 响应 | `GET /config/llm/models` |
| 获取 Embed 模型 | 嵌在 config 响应 | `GET /config/embed/models` |

### 前端迁移

**EmbedConfigRequest 移除的字段：** `fallback_provider` `fallback_model` `fallback_api_key`

**替代方案：** 主和备用分开两个请求：

```bash
# 保存主 Provider — 不再传 fallback 字段
curl -X PUT .../config/embed \
  -d '{"provider":"gemini","model":"gemini-embedding-001","api_key":"k1","cf_account_id":""}'

# 保存备用 Provider
curl -X PUT .../config/embed/fallback \
  -d '{"provider":"zhipu","model":"embedding-2","api_key":"k2"}'
```

**获取模型列表（独立请求）：**

```bash
curl .../config/llm/models?provider=gemini          # LLM 模型
curl .../config/embed/models                         # Embed 主模型
curl .../config/embed/models?fallback=true           # Embed 备用模型
```

**`GET /config/embed` 新增字段：** `fallback_dynamic_models`（备用 Provider 的模型列表）

---

## POST /knowledge/import

导入文档到知识库。支持 URL、GitHub 仓库文件、本地文件三种来源。

### 请求

**Content-Type:** `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | string | 是 | 文档来源地址 |
| `source_type` | string | 是 | 来源类型：`url` / `github` / `github_repo` / `filepath` |

**source_type 说明：**

| 值 | 说明 | source 示例 |
|----|------|-------------|
| `url` | 网页 / Raw 文件 URL | `https://raw.githubusercontent.com/gin-gonic/gin/master/README.md` |
| `github` | GitHub blob URL（自动转为 raw） | `https://github.com/gin-gonic/gin/blob/master/context.go` |
| `github_repo` | **GitHub 仓库（克隆全部源码文件导入）** | `https://github.com/gin-gonic/gin` |
| `filepath` | 服务器本地文件绝对路径 | `/root/documents/my-file.py` |

### 请求示例

```bash
# URL 导入
curl -X POST http://172.29.84.122:8080/knowledge/import \
  -H "Content-Type: application/json" \
  -d '{"source":"https://raw.githubusercontent.com/gin-gonic/gin/master/README.md","source_type":"url"}'

# GitHub 导入
curl -X POST http://172.29.84.122:8080/knowledge/import \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin/blob/master/context.go","source_type":"github"}'

# GitHub 仓库导入（克隆全部源码）
curl -X POST http://172.29.84.122:8080/knowledge/import \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin","source_type":"github_repo"}'

# 本地文件导入
curl -X POST http://172.29.84.122:8080/knowledge/import \
  -H "Content-Type: application/json" \
  -d '{"source":"/root/documents/notes.txt","source_type":"filepath"}'
```

### 响应

**200 OK：**

```json
{
  "status": "ok",
  "indexed_count": 1,
  "chunk_count": 14,
  "batch_id": "019e2b11-b8a4-72aa-abff-52c4edefd9f4"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定为 `"ok"` |
| `indexed_count` | int | 处理的源文档数量 |
| `chunk_count` | int | 实际索引的 chunk 数量 |
| `batch_id` | string | UUID v7 批次 ID，用于取消/回退整批导入 |

**错误响应：**

```json
// 400 — 请求参数错误
{"error": "source and source_type are required"}

// 500 — 后端服务错误
{"error": "python service error (HTTP 500): Indexing failed: ..."}
```

---

## POST /knowledge/upload

上传本地文件直接导入知识库，文件内容自动完成 chunk 分块 → LLM 元数据分类 → embedding 向量化 → Qdrant 存储。

**每次调用只消耗 1 次 LLM 调用（整篇文档分类一次，所有 chunk 共用元数据）。**

### 请求

**Content-Type:** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 要导入的文件，支持文本格式：`.md` `.py` `.go` `.java` `.txt` `.json` `.yaml` `.yml` `.toml` `.cfg` `.ini` 等 |

### 请求示例

```bash
# 上传 Go 源码文件
curl -X POST http://172.29.84.122:8080/knowledge/upload \
  -F "file=@/path/to/handler.go"

# 上传 Markdown 文档
curl -X POST http://172.29.84.122:8080/knowledge/upload \
  -F "file=@/path/to/README.md"

# 上传 Python 脚本
curl -X POST http://172.29.84.122:8080/knowledge/upload \
  -F "file=@/path/to/script.py"
```

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
// 400 — 未提供文件或文件格式错误
{"error": "file is required"}
// 或
{"error": "python service error (HTTP 400): File is not UTF-8 text"}

// 500 — 后端服务错误
{"error": "python service error (HTTP 500): Indexing failed: ..."}
```

---

## POST /knowledge/import/stream

SSE (Server-Sent Events) 流式导入文档，实时推送处理进度。适合前端展示导入进度条。

### 请求

**Content-Type:** `application/json`

请求字段与 `/knowledge/import` 完全一致。

```json
{
  "source": "https://github.com/gin-gonic/gin",
  "source_type": "github"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | string | 是 | 文档来源地址 |
| `source_type` | string | 是 | 来源类型：`url` / `github` / `filepath` |

### 响应（SSE 事件流）

**Content-Type:** `text/event-stream`

每个事件为一行 `data: <JSON>`，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `step` | string | 当前步骤：`fetching` / `chunking` / `classifying` / `embedding` / `storing` / `done` / `error` |
| `progress` | int | 进度百分比 0-100 |
| `message` | string | 中文步骤描述 |
| `meta` | object | **仅 classifying 步骤**，分类结果（domain/language/framework/type/topic/tags） |

### 5 步管道

```
fetching          chunking        classifying       embedding         storing           done
  (0-20%)    →    (20-40%)   →    (40-60%)    →    (60-80%)    →    (80-95%)    →    (100%)
 获取文档          分块处理          LLM 分类         向量化            写入 Qdrant        完成
```

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

### 请求示例

**curl（-N 禁用缓冲）：**

```bash
curl -N -X POST http://172.29.84.122:8080/knowledge/import/stream \
  -H "Content-Type: application/json" \
  -d '{"source":"https://github.com/gin-gonic/gin","source_type":"github"}'
```

**JavaScript 前端使用：**

```javascript
const response = await fetch('/knowledge/import/stream', {
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

---

## POST /knowledge/upload/stream

SSE 流式上传文件导入，实时推送处理进度。跳过 fetching 阶段直接从 chunking 开始。

### 请求

**Content-Type:** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 要上传的文本文件（UTF-8 编码），支持 `.md` `.py` `.go` `.txt` 等 |

### 响应

SSE 事件流，格式同 `/knowledge/import/stream`。管道从 chunking (20%) 开始，无 fetching 阶段。

### 请求示例

```bash
curl -N -X POST http://172.29.84.122:8080/knowledge/upload/stream \
  -F "file=@/path/to/handler.go"
```

---

## DELETE /knowledge/{id}

按 UUID 删除单条知识条目。

### 请求

```bash
curl -X DELETE http://172.29.84.122:8080/knowledge/019e2b11-b8a4-72aa-abff-52c4edefd9f4
```

### 响应

**200 OK：**

```json
{"status": "ok", "deleted_count": 1}
```

**404：**

```json
{"error": "python service error (HTTP 404): Point not found: 019e2b11-..."}
```

---

## DELETE /knowledge/batch

批量删除知识条目，支持多种过滤条件。

### 请求

**Content-Type:** `application/json`

```json
{
  "batch_id": "019e2b11-b8a4-72aa-abff-52c4edefd9f4",
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
curl -X DELETE http://172.29.84.122:8080/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"019e2b11-b8a4-72aa-abff-52c4edefd9f4"}'

# 按 source 删除
curl -X DELETE http://172.29.84.122:8080/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"source":"https://raw.githubusercontent.com/gin-gonic/gin/master/README.md"}'

# 按 ID 列表删除
curl -X DELETE http://172.29.84.122:8080/knowledge/batch \
  -H "Content-Type: application/json" \
  -d '{"ids":["id-1","id-2","id-3"]}'
```

### 响应

```json
{"status": "ok", "deleted_count": 5}
```

**404：**

```json
{"error": "python service error (HTTP 404): No matching points found"}
```

---

## 取消与回退机制

SSE 流式导入支持前端取消并回退已写入的数据：

```
1. 前端发起 POST /knowledge/import/stream
2. SSE 首个事件包含 batch_id:
   data: {"step":"batch","progress":0,"message":"batch_id=xxx","meta":{"batch_id":"019e2b11-..."}}
3. 用户点击取消 → 前端 AbortController.abort()
4. 前端调用 DELETE /knowledge/batch 传入 batch_id
5. 该批次所有已写入 chunk 被物理删除
```

---

## POST /knowledge/search

语义检索，支持按元数据字段精确过滤。

### 请求

**Content-Type:** `application/json`

```json
{
  "query": "How to handle JWT authentication in Go?",
  "filters": {
    "domain": "Backend",
    "language": "Go",
    "framework": "Gin",
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
| `filters` | object | 否 | 元数据过滤条件，所有字段可选 |
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
# 带过滤条件的查询
curl -X POST http://172.29.84.122:8080/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query":"How to handle JWT authentication in Gin?","filters":{"domain":"Backend","language":"Go"},"top_k":3}'

# 无过滤条件的查询
curl -X POST http://172.29.84.122:8080/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query":"PostgreSQL connection pool best practices","top_k":10}'
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
| `results[].metadata` | object | 结构化分类元数据 |
| `results[].metadata.domain` | string | 技术领域 |
| `results[].metadata.language` | string | 编程语言 |
| `results[].metadata.framework` | string | 框架 |
| `results[].metadata.type` | string | 内容类型 |
| `results[].metadata.topic` | string | 主题 |
| `results[].metadata.tags` | string[] | 标签 |
| `results[].metadata.source` | string\|null | 原始出处 URL |
| `results[].metadata.version` | string | 版本号 |
| `results[].metadata.status` | string | 状态 |
| `results[].metadata.project_id` | string\|null | 项目 ID |
| `results[].score` | float | 余弦相似度（0~1） |
| `results[].created_at` | string\|null | 创建时间（ISO 8601） |
| `results[].updated_at` | string\|null | 更新时间（ISO 8601） |
| `count` | int | 返回结果数量 |

**错误响应：**

```json
// 400 — 请求参数错误
{"error": "query is required"}

// 500 — 后端服务错误
{"error": "python service error (HTTP 500): ..."}
```

---

## GET /knowledge/stats

返回 Python 后端服务和 Qdrant 向量数据库的运行状态与统计数据。

### 请求示例

```bash
curl http://172.29.84.122:8080/knowledge/stats
```

### 响应

**200 OK：**

```json
{
  "python_service": {
    "status": "healthy"
  },
  "qdrant": {
    "collection": {
      "exists": true,
      "points_count": 1456
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `python_service.status` | string | Python 服务健康状态 |
| `qdrant.collection.exists` | bool | Qdrant 集合是否存在 |
| `qdrant.collection.points_count` | int | 向量数据库中的总 chunk 数量 |

---

## GET /knowledge/cache

返回 Embedding 模块的 LRU 缓存统计，包括命中率、缓存大小等。

### 请求示例

```bash
curl http://172.29.84.122:8080/knowledge/cache
```

### 响应

**200 OK：**

```json
{
  "size": 256,
  "hits": 1823,
  "misses": 512,
  "max": 2048
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `size` | int | 当前缓存条目数 |
| `hits` | int | 缓存命中次数（命中不调用 Embedding API） |
| `misses` | int | 缓存未命中次数 |
| `max` | int | 缓存最大容量（LRU 淘汰策略） |

**技术说明：**
- 缓存 Key = SHA-256(text)，相同查询重复调用不消耗 Embedding API 配额
- 双 Provider：Gemini 为主，智谱为 fallback（自动在 429/5xx 时切换）
- 缓存满时按 LRU 淘汰最久未使用的条目

---

## GET /knowledge/graph

返回知识库元数据的聚合统计，包括按领域、语言、框架、类型维度的分布。

### 请求示例

```bash
curl http://172.29.84.122:8080/knowledge/graph
```

### 响应

**200 OK：**

```json
{
  "total_points_sampled": 500,
  "aggregation": {
    "domain": {
      "Backend": 180,
      "Frontend": 120,
      "Database": 85,
      "DevOps": 65,
      "Android": 50
    },
    "language": {
      "Go": 150,
      "Python": 130,
      "TypeScript": 100,
      "Java": 60,
      "SQL": 40,
      "Kotlin": 20
    },
    "framework": {
      "Gin": 80,
      "FastAPI": 70,
      "React": 65,
      "Vue": 55,
      "Spring": 40,
      "Django": 35,
      "Flask": 30,
      "Next.js": 25,
      "Kubernetes": 20,
      "None": 80
    },
    "type": {
      "API": 200,
      "Concept": 150,
      "Example": 100,
      "Tutorial": 50
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_points_sampled` | int | 实际采样的 chunk 数量（上限 500） |
| `aggregation.domain` | object | 领域分布 `{field: count}` |
| `aggregation.language` | object | 语言分布 `{field: count}` |
| `aggregation.framework` | object | 框架分布 `{field: count}` |
| `aggregation.type` | object | 内容类型分布 `{field: count}` |

---

## GET /config/llm

查看当前 LLM 配置（API Key 脱敏）和所有可用服务商列表。

> **注意：** 模型列表不再嵌入此响应中，请用 `GET /config/llm/models` 获取。

```bash
curl http://172.29.84.122:8080/config/llm
```

### 响应

```json
{
  "provider": "longcat",
  "model": "LongCat-Flash-Chat",
  "api_key": "ak_23f4H***",
  "base_url": "https://api.longcat.chat/openai/v1",
  "available_providers": [
    {"id": "openai", "name": "OpenAI", "base_url": "https://api.openai.com/v1", "models": ["gpt-4.1", "gpt-4o"]},
    {"id": "gemini", "name": "Gemini", "base_url": "...", "models": ["gemini-2.5-flash"]}
  ]
}
```

---

## GET /config/llm/models

获取 LLM 模型列表（**纯查询，不修改任何配置**）。用已配置的 API Key 从服务商实时拉取。

```bash
# 用当前配置的 provider
curl http://172.29.84.122:8080/config/llm/models

# 指定 provider
curl "http://172.29.84.122:8080/config/llm/models?provider=gemini"
```

### 响应

```json
{
  "source": "dynamic",
  "models": ["LongCat-Flash-Chat", "LongCat-Flash-Chat-1M", "LongCat-2.0-Preview"],
  "error": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | string | `dynamic`=`preset`=`fallback`=`error` |
| `models` | string[] | 模型名称列表（**前端直接取此数组渲染下拉**） |
| `error` | string\|null | `source=preset` 时为 `null` |

**`source` 取值：**

| source | 含义 | 前端处理 |
|--------|------|---------|
| `dynamic` | 实时获取成功 | 直接用 `models[]` |
| `preset` | 非 OpenAI 格式（Cloudflare）| 直接用 `models[]`（3 个 BGE 模型） |
| `fallback` | API 失败回退预设 | 显示 `error`，`models[]` 仍可用 |
| `error` | 完全失败 | `models[]` 为空 |

---

## PUT /config/llm

手动配置 LLM 服务商、模型和 API Key，保存后即时生效。

### 请求

**Content-Type:** `application/json`

```json
{
  "provider": "zhipu",
  "model": "glm-4-air",
  "api_key": "your-zhipu-key"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | string | 是 | 服务商 ID：openai / deepseek / gemini / cloudflare / zhipu / longcat |
| `model` | string | 是 | 模型名称（须在可用列表中） |
| `api_key` | string | 是 | API Key |

### 请求示例

```bash
curl -X PUT http://172.29.84.122:8080/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider":"zhipu","model":"glm-4-air","api_key":"your-key"}'
```

### 响应

同 `GET /config/llm`。

---

## GET /config/embed

查看当前 Embedding 配置（脱敏），含主 + 备用 Provider。

> **注意：** 模型列表不再嵌入此响应，请用 `GET /config/embed/models` 获取。

```bash
curl http://172.29.84.122:8080/config/embed
```

### 响应

```json
{
  "mode": "provider",
  "use_local": false,
  "provider": "gemini",
  "model": "gemini-embedding-001",
  "api_key": "AIzaSyB***",
  "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "local_url": "",
  "cf_account_id": "",
  "fallback_provider": "zhipu",
  "fallback_model": "embedding-2",
  "fallback_api_key": "0b91d64***",
  "fallback_cf_account_id": "",
  "available_providers": [...],
  "dynamic_models": null,
  "fallback_dynamic_models": null,
  "warning": null,
  "cache_cleared": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | `provider`=云服务商 / `local`=本地部署 |
| `use_local` | bool | 是否启用本地 Embedding（`mode=local` 时为 `true`） |
| `local_url` | string | 本地服务地址（仅 local 模式） |
| `cf_account_id` | string | Cloudflare Account ID |
| `fallback_cf_account_id` | string | 备用 Cloudflare Account ID |
| `dynamic_models` | object\|null | 已废弃，用 `GET /config/embed/models` |
| `fallback_dynamic_models` | object\|null | 已废弃，用 `GET /config/embed/models?fallback=true` |
| `warning` | string\|null | 模型变更警告 |
| `cache_cleared` | bool | 缓存已清空 |

---

## PUT /config/embed

**仅保存主 Embedding Provider**。支持云服务商和本地部署两种模式。

### 请求

**Content-Type:** `application/json`

**云服务商模式（mode=provider，默认）：**

```json
{
  "mode": "provider",
  "provider": "gemini",
  "model": "gemini-embedding-001",
  "api_key": "your-gemini-key",
  "cf_account_id": ""
}
```

**本地部署模式（mode=local）：**

```json
{
  "mode": "local",
  "provider": "ollama",
  "model": "nomic-embed-text",
  "local_url": "http://192.168.1.100:11434/v1"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 否 | `provider`(默认)=云服务商 / `local`=本地部署 |
| `provider` | string | provider模式必填 | 服务商 ID（ollama / lmstudio / custom_openai 等） |
| `model` | string | 是 | Embedding 模型名称 |
| `api_key` | string | provider模式必填 | API Key（local 模式可选） |
| `local_url` | string | local模式必填 | 本地服务地址（含 `/v1` 后缀） |
| `cf_account_id` | string | 否 | Cloudflare Account ID |

### 可用本地 Provider

| ID | 说明 | 推荐模型 |
|----|------|---------|
| `ollama` | Ollama 本地/远程服务 | nomic-embed-text (768d), bge-m3 (1024d) |
| `lmstudio` | LM Studio 本地服务 | 在 LM Studio 中加载的 embedding 模型 |
| `custom_openai` | 自定义 OpenAI 兼容 | text-embeddings-inference, vllm, localai 等 |

> **注意：** `fallback_*` 字段已移至 `PUT /config/embed/fallback`。

### 请求示例

```bash
# 云服务商
curl -X PUT http://172.29.84.122:8080/config/embed \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","model":"gemini-embedding-001","api_key":"k1"}'

# 本地 Ollama
curl -X PUT http://172.29.84.122:8080/config/embed \
  -H "Content-Type: application/json" \
  -d '{"mode":"local","provider":"ollama","model":"nomic-embed-text","local_url":"http://localhost:11434/v1"}'
```

### 响应

同 `GET /config/embed`，额外包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `warning` | string\|null | 模型切换警告（向量维度不兼容时提示重建索引） |
| `cache_cleared` | bool | 是否已清空 Embedding LRU 缓存（切换模型时为 `true`） |

> **注意**：切换 Embedding 模型后，Qdrant 中的旧向量与新模型不兼容，需要调用 `/knowledge/import` 重新导入文档。

### 响应

同 `GET /config/embed`，额外含 `warning` + `cache_cleared`。

---

## GET /config/embed/models

获取 Embedding 模型列表（**纯查询，不修改配置**）。可用已配置的 API Key 从服务商实时拉取。

```bash
# 主 Provider 模型
curl http://172.29.84.122:8080/config/embed/models

# 备用 Provider 模型
curl "http://172.29.84.122:8080/config/embed/models?fallback=true"

# 指定其他 Provider（需该 Provider 已配置）
curl "http://172.29.84.122:8080/config/embed/models?provider=openai"
```

### 响应

同 `GET /config/llm/models`，返回 `DynamicModels` 对象。

---

## PUT /config/embed/fallback

**仅保存备用 Embedding Provider**。主 Provider 由 `PUT /config/embed` 管理，两者独立。

### 请求

**Content-Type:** `application/json`

```json
{
  "provider": "cloudflare",
  "model": "@cf/baai/bge-base-en-v1.5",
  "api_key": "cfut_xxx",
  "cf_account_id": "ad81568c8e54e5c51e56f5e762cd06a1"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `provider` | string | 备用服务商 ID（传空串=清空） |
| `model` | string | 备用模型名称 |
| `api_key` | string | 备用 API Key / Cloudflare API Token |
| `cf_account_id` | string | Cloudflare Account ID（**仅备用为 Cloudflare 时需要**） |

### 请求示例

```bash
# Cloudflare 作为备用
curl -X PUT http://172.29.84.122:8080/config/embed/fallback \
  -H "Content-Type: application/json" \
  -d '{"provider":"cloudflare","model":"@cf/baai/bge-base-en-v1.5","api_key":"cfut_xxx","cf_account_id":"ad81568c..."}'

# 智谱作为备用（不需要 cf_account_id）
curl -X PUT http://172.29.84.122:8080/config/embed/fallback \
  -H "Content-Type: application/json" \
  -d '{"provider":"zhipu","model":"embedding-2","api_key":"your-key"}'
```

### 响应

同 `GET /config/embed`。

---

## PUT /config/embed/toggle

切换本地/供应商 Embedding。无需 JSON body，通过 query 参数控制。

### 请求

```bash
# 启用本地 Embedding
curl -X PUT "http://172.29.84.122:8080/config/embed/toggle?enabled=true"

# 切换回供应商 Embedding
curl -X PUT "http://172.29.84.122:8080/config/embed/toggle?enabled=false"
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `enabled` | bool | 是 | `true`=启用本地 / `false`=供应商 |

### 响应

```json
{"use_local": true, "message": "已切换至本地 Embedding"}
```

切换到本地模式后，`GET /config/embed` 的 `use_local` 变为 `true`。

---

## 配置

服务通过 `config.yaml` 文件配置，支持环境变量覆盖：

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `server_port` | `SERVER_PORT` | `8080` | 网关监听端口 |
| `python_base_url` | `PYTHON_BASE_URL` | `http://localhost:8000` | Python RAG 服务地址 |
| `qdrant_url` | `QDRANT_URL` | `http://localhost:6333` | Qdrant REST API 地址 |
| `qdrant_collection` | `QDRANT_COLLECTION` | `knowledge_items` | Qdrant 集合名称 |

**环境变量优先级高于 config.yaml。**

---

## 部署

### 构建

```bash
cd knowledge-gateway
go mod tidy
go build -o knowledge-gateway .
```

### 启动

```bash
# 使用配置文件
./knowledge-gateway

# 指定配置文件路径
CONFIG_PATH=/etc/knowledge-gateway/config.yaml ./knowledge-gateway

# 使用环境变量
SERVER_PORT=9090 PYTHON_BASE_URL=http://localhost:8000 ./knowledge-gateway
```

### 健康检查

```bash
curl http://172.29.84.122:8080/knowledge/stats
```

---

## 错误码汇总

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误（缺少必填字段、格式错误、Unicode 编码等） |
| 500 | 后端服务异常 |

### v1.7.1 错误消息格式优化

所有 500 错误的 `error` 字段现已携带**服务商标识前缀**，前端可直接展示或解析：

| 前缀格式 | 示例 | 说明 |
|---------|------|------|
| `[LLM: provider/model]` | `[LLM: longcat/LongCat-Flash-Chat] Error code: 429...` | LLM 调用失败，带服务商和模型名 |
| `[Embedding: provider/model]` | `[Embedding: gemini/gemini-embedding-001] Error code: 429...` | Embedding 调用失败 |
| `[Embedding: Cloudflare]` | `[Embedding: Cloudflare] 401 Unauthorized` | Cloudflare 认证失败 |

**错误消息中含有的关键信息：**
- 服务商名称 + 模型名称
- 429 限流时提示余额不足 + 建议切换
- Embedding 429 额外提示"若已配置备用 Provider 将自动切换"
- Cloudflare 错误单独标注

所有错误响应均为 JSON 格式，包含 `error` 字段描述具体错误原因。
