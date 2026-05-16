# 多技术栈知识库系统 — 数据模型设计（v2：Code Knowledge Graph）

---

## 一、数据结构定义（JSON Schema）

> **兼容性声明：** 以下 Schema 在 v1 基础上**仅做增量添加**，所有原有字段保持不变。新增 `code_context`（顶层可选字段）和 `metadata.project_id`（metadata 可选字段）。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kb.internal/schemas/knowledge-item.schema.json",
  "title": "KnowledgeItem",
  "description": "多技术栈知识库核心条目，v2 支持代码知识图谱",
  "type": "object",
  "required": ["id", "content", "metadata"],
  "properties": {

    "id": {
      "type": "string",
      "format": "uuid",
      "description": "全局唯一标识符，UUID v7（时间有序）"
    },
    "content": {
      "type": "string",
      "minLength": 1,
      "maxLength": 131072,
      "description": "知识条目的正文内容。对于代码类条目，存放完整源代码片段"
    },
    "embedding": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 768,
      "maxItems": 3072,
      "description": "内容向量化表示，用于语义相似度检索"
    },

    "metadata": {
      "type": "object",
      "required": ["domain", "language", "framework", "type", "topic", "tags"],
      "properties": {
        "domain": {
          "type": "string",
          "enum": ["Android", "Backend", "Database", "Frontend", "DevOps"],
          "description": "一级分类：技术领域"
        },
        "language": {
          "type": "string",
          "enum": ["Kotlin", "Java", "Python", "Go", "SQL", "TypeScript", "Rust", "Swift"],
          "description": "编程语言"
        },
        "framework": {
          "type": "string",
          "enum": [
            "Jetpack", "Spring", "Gin", "Flask", "FastAPI", "Django",
            "React", "Vue", "Next.js", "Kubernetes", "Terraform", "None"
          ],
          "description": "框架 / 运行时（无框架时填 \"None\"）"
        },
        "type": {
          "type": "string",
          "enum": ["API", "Tutorial", "Example", "Concept"],
          "description": "内容类型"
        },
        "topic": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "description": "二级分类：细粒度主题"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string", "maxLength": 64 },
          "minItems": 1,
          "maxItems": 20,
          "uniqueItems": true,
          "description": "自由标签"
        },
        "source": {
          "type": "string",
          "format": "uri",
          "description": "原始出处 URL"
        },
        "version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$"
        },
        "status": {
          "type": "string",
          "enum": ["draft", "published", "archived"],
          "default": "published"
        },

        "project_id": {
          "type": "string",
          "format": "uuid",
          "description": "【v2 新增】所属项目 ID，实现多项目隔离。NULL 表示全局知识条目"
        }
      }
    },

    "code_context": {
      "type": "object",
      "description": "【v2 新增】代码级知识图谱上下文。仅代码符号条目有此字段，非代码条目为 null",
      "required": ["symbol_type", "symbol_name", "file_path"],
      "properties": {
        "symbol_type": {
          "type": "string",
          "enum": ["function", "method", "class", "interface", "module", "variable", "constant", "type"],
          "description": "代码符号类型"
        },
        "symbol_name": {
          "type": "string",
          "maxLength": 256,
          "description": "符号标识名，如 \"AuthMiddleware\"、\"parseJWT\""
        },
        "file_path": {
          "type": "string",
          "maxLength": 1024,
          "description": "项目内的相对文件路径，如 \"middleware/auth.go\""
        },
        "line_start": {
          "type": "integer",
          "minimum": 1,
          "description": "符号定义起始行号（1-based）"
        },
        "line_end": {
          "type": "integer",
          "minimum": 1,
          "description": "符号定义结束行号（1-based，包含闭合）"
        },
        "signature": {
          "type": "string",
          "maxLength": 512,
          "description": "完整签名，如 \"func AuthMiddleware() gin.HandlerFunc\""
        },
        "parameters": {
          "type": "array",
          "items": { "$ref": "#/$defs/parameter" },
          "description": "参数列表"
        },
        "return_type": {
          "type": "string",
          "maxLength": 256,
          "description": "返回值类型"
        },
        "modifiers": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["public", "private", "protected", "static", "async", "abstract", "final", "exported", "unexported"]
          },
          "uniqueItems": true,
          "description": "修饰符集合"
        },
        "parent_symbol": {
          "type": "string",
          "description": "所属父符号名。method 指向 class，嵌套函数指向外层函数"
        },
        "doc_comment": {
          "type": "string",
          "maxLength": 4096,
          "description": "提取的文档注释（JSDoc / godoc / docstring）"
        },
        "relations": {
          "type": "object",
          "description": "【核心】代码关系图谱，支撑 Agent 调用链追踪",
          "properties": {
            "calls": {
              "type": "array",
              "items": { "$ref": "#/$defs/symbol_ref" },
              "description": "本符号调用了哪些函数/方法"
            },
            "called_by": {
              "type": "array",
              "items": { "$ref": "#/$defs/symbol_ref" },
              "description": "哪些符号调用了本符号（逆向关系，索引阶段填充）"
            },
            "imports": {
              "type": "array",
              "items": { "$ref": "#/$defs/import_ref" },
              "description": "本文件/模块的导入依赖"
            },
            "extends": {
              "type": "string",
              "description": "面向对象：继承的父类"
            },
            "implements": {
              "type": "array",
              "items": { "type": "string" },
              "description": "面向对象：实现的接口"
            },
            "instantiates": {
              "type": "array",
              "items": { "$ref": "#/$defs/symbol_ref" },
              "description": "本符号创建（new/实例化）了哪些类型"
            },
            "type_refs": {
              "type": "array",
              "items": { "$ref": "#/$defs/symbol_ref" },
              "description": "本符号引用了哪些类型（参数类型、返回值类型、变量类型）"
            }
          }
        }
      }
    },

    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "embedding_model": {
      "type": "string",
      "examples": ["text-embedding-3-large@1536", "bge-m3@1024"]
    }
  },

  "$defs": {
    "parameter": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name":        { "type": "string" },
        "type":        { "type": "string", "description": "类型标注，如 \"string\"、\"*gin.Context\"" },
        "default":     { "type": "string", "description": "默认值字面量" },
        "required":    { "type": "boolean", "default": true }
      }
    },
    "symbol_ref": {
      "type": "object",
      "required": ["symbol_name", "file_path"],
      "properties": {
        "symbol_name": { "type": "string", "description": "被引用的符号名" },
        "symbol_type": { "type": "string", "enum": ["function", "method", "class", "interface", "module", "variable", "constant", "type"] },
        "file_path":   { "type": "string", "description": "被引用符号所在的文件路径" },
        "line":        { "type": "integer", "minimum": 1, "description": "引用发生的行号" },
        "project_id":  { "type": "string", "description": "被引用符号所属项目 ID（跨项目引用时非空）" }
      }
    },
    "import_ref": {
      "type": "object",
      "required": ["module"],
      "properties": {
        "module":  { "type": "string", "description": "导入的模块名，如 \"github.com/gin-gonic/gin\"" },
        "alias":   { "type": "string", "description": "导入别名" },
        "symbols": { "type": "array", "items": { "type": "string" }, "description": "具名导入的符号列表（JS/TS）" }
      }
    }
  }
}
```

---

## 二、字段说明表

### 2.1 原有字段（不变）

| 字段 | 类型 | 必填 | 说明 | 索引 |
|------|------|------|------|------|
| `id` | UUID v7 | 是 | 全局主键 | 聚簇索引 |
| `content` | string | 是 | 知识/Markdown/源码 | GiST 全文索引 |
| `embedding` | float[] | 否 | 语义向量 | **向量索引**（ivfflat/HNSW） |
| `metadata.*` | JSONB | 是 | 分类元数据 | 见下方 |
| `metadata.project_id` | UUID | 否 | **【v2】多项目隔离** | B-tree + 联合索引 |
| `created_at` | timestamptz | 是 | 创建时间 | B-tree |
| `updated_at` | timestamptz | 是 | 更新时间 | B-tree |
| `embedding_model` | string | 否 | 向量模型 | — |

### 2.2 code_context 核心字段（v2 新增）

| 字段路径 | 类型 | 必填 | 说明 | Agent 用途 |
|----------|------|------|------|------------|
| `code_context.symbol_type` | enum | 是 | function / method / class / interface / module / variable / constant / type | 过滤查询范围 |
| `code_context.symbol_name` | string | 是 | 符号标识名 | **精确定位修改目标** |
| `code_context.file_path` | string | 是 | 文件相对路径 | **导航到源文件** |
| `code_context.line_start` | int | 否 | 起始行（1-based） | **跳转到精确行** |
| `code_context.line_end` | int | 否 | 结束行 | 确定符号作用域 |
| `code_context.signature` | string | 否 | 完整签名 | **Agent 比对签名是否匹配** |
| `code_context.parameters` | array | 否 | 参数列表（含类型） | **生成修改代码时填充参数** |
| `code_context.return_type` | string | 否 | 返回值类型 | 类型检查、代码生成 |
| `code_context.modifiers` | array | 否 | 修饰符 | 判断可见性/可重写性 |
| `code_context.parent_symbol` | string | 否 | 父符号 | 方法→类回溯 |
| `code_context.doc_comment` | string | 否 | 文档注释原文 | 理解意图/生成文档 |

### 2.3 code_context.relations 关系字段（v2 核心新增）

| 字段路径 | 类型 | 说明 | Agent 查询场景 |
|----------|------|------|---------------|
| `relations.calls[]` | symbol_ref[] | 我调用了谁 | "这个函数内部做了什么？" |
| `relations.called_by[]` | symbol_ref[] | 谁调用了我 | "改这个签名会影响谁？" |
| `relations.imports[]` | import_ref[] | 我依赖哪些包 | "需要安装什么依赖？" |
| `relations.extends` | string | 继承的父类 | "父类提供了哪些方法？" |
| `relations.implements[]` | string[] | 实现的接口 | "这个类的契约是什么？" |
| `relations.instantiates[]` | symbol_ref[] | 实例化了哪些类型 | "创建了哪些对象？" |
| `relations.type_refs[]` | symbol_ref[] | 引用了哪些类型 | "类型依赖图" |

---

## 三、Code Knowledge Graph 核心设计

### 3.1 设计原则

```
┌──────────────────────────────────────────────────────┐
│                   KnowledgeItem                       │
│                                                       │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ content │  │  metadata   │  │  code_context    │  │
│  │ 源码/文档 │  │  分类/标签   │  │  ← v2 新增，可选  │  │
│  └─────────┘  └─────────────┘  └──────────────────┘  │
│                                       │               │
│                          ┌────────────┴───────────┐   │
│                          │    relations (关系图)    │   │
│                          │                         │   │
│                          │  calls ←→ called_by    │   │
│                          │  imports               │   │
│                          │  extends / implements  │   │
│                          └────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**关键决策：**

1. **`code_context` 是可选顶层字段** — 非代码条目（教程/概念/示例）不需要它，Schema 向后完全兼容
2. **关系存于条目内部，不建外键表** — 查询时直接在 JSONB 上做 GIN 索引检索，避免跨表 JOIN；索引阶段统一填充 `called_by` 反向关系
3. **`symbol_ref` 用 `file_path + symbol_name` 定位，而非用 `id`** — 代码符号在解析时还没有 UUID，用自然键做引用更自然；UUID 在持久化后回填

### 3.2 关系数据的写入与维护

```
源代码 ──► AST 解析器 ──► 符号表 ──► code_context 填充 ──► KnowledgeItem 写入
              │
              │  解析出 calls / imports / extends 等正向关系
              │
              ▼
         索引器（Indexer）
              │
              │  聚合所有符号的 calls，生成反向 called_by
              │  跨文件匹配 symbol_name + file_path
              │
              ▼
         批量更新 called_by 到各条目的 code_context.relations
```

**索引器的核心逻辑（伪代码）：**

```python
def build_called_by(kb_items: list[KnowledgeItem]):
    # 1. 构建 symbol → id 映射
    symbol_index: dict[tuple[str, str, str], str] = {}
    for item in kb_items:
        if item.code_context:
            key = (item.code_context.symbol_name,
                   item.code_context.file_path,
                   item.metadata.project_id)
            symbol_index[key] = item.id

    # 2. 遍历所有条目的 calls，推断 called_by
    reverse: dict[str, list[symbol_ref]] = defaultdict(list)
    for item in kb_items:
        if item.code_context and item.code_context.relations:
            for callee in item.code_context.relations.calls:
                callee_key = (callee.symbol_name, callee.file_path, callee.project_id)
                if callee_key in symbol_index:
                    reverse[symbol_index[callee_key]].append(
                        symbol_ref(symbol_name=item.code_context.symbol_name,
                                   file_path=item.code_context.file_path,
                                   line=callee.line,
                                   project_id=item.metadata.project_id)
                    )

    # 3. 回写 called_by
    for target_id, callers in reverse.items():
        update_kb_item(target_id, {"code_context.relations.called_by": callers})
```

### 3.3 项目隔离模型

```
project_id = "proj-001"          project_id = "proj-002"        project_id = null
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  UserService.java   │    │  UserService.java   │    │  PostgreSQL 连接池    │
│  AuthMiddleware.go  │    │  OrderHandler.go    │    │  Docker Compose 编排  │
│  ...                │    │  ...                │    │  ...                 │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
    项目 A 的知识图谱           项目 B 的知识图谱          全局知识（跨项目共享）
```

- `project_id = null` → 全局通用知识（教程、概念、最佳实践），所有项目可见
- `project_id = UUID` → 项目专属代码，仅在项目上下文中检索
- `symbol_ref.project_id` → 跨项目调用关系（如项目 A 调用项目 B 的公共库）

---

## 四、Agent 执行模型

### 4.1 核心查询模式：Agent 如何用这个 Schema 工作

#### 场景 1：「找到函数 X，并导航到它的定义」

```
Agent 输入: "修改 AuthMiddleware 函数"
         │
         ▼
SELECT id, content,
       code_context->>'file_path'   AS file,
       code_context->>'line_start'  AS line
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'AuthMiddleware'
  AND metadata->>'project_id' = $current_project;
         │
         ▼
Agent 输出: 打开 middleware/auth.go，跳转到第 15 行
```

#### 场景 2：「修改函数签名前，找出所有调用者」

```
Agent 输入: "AuthMiddleware 需要增加一个 logger 参数，哪些地方会受影响？"
         │
         ▼
-- 直接读取 AuthMiddleware 条目的 called_by 字段
SELECT code_context->'relations'->'called_by' AS callers
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'AuthMiddleware'
  AND metadata->>'project_id' = $current_project;
         │
         ▼
返回:
[
  {"symbol_name": "SetupRouter", "file_path": "router/router.go", "line": 25},
  {"symbol_name": "main",        "file_path": "main.go",           "line": 42}
]
         │
         ▼
Agent 输出: "AuthMiddleware 被 2 处调用，都需要更新：
            router/router.go:25 和 main.go:42"
```

#### 场景 3：「Bug 报告：parseJWT 返回 nil pointer，追溯根因」

```
Agent 输入: "parseJWT 返回 nil，请定位问题"
         │
         ▼
Step 1 — 定位 parseJWT:
SELECT content, code_context->>'signature' AS sig,
       code_context->>'line_start' AS start,
       code_context->>'line_end'   AS end
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'parseJWT';
         │
         ▼
Step 2 — 查看谁调用了它（调用方传入了什么）:
SELECT code_context->>'symbol_name' AS caller,
       code_context->'relations'->'called_by' AS callers_of_parseJWT
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'parseJWT';
         │
         ▼
Step 3 — 查看 parseJWT 内部调用了什么（哪个子调用可能返回 nil）:
SELECT code_context->'relations'->'calls' AS callees
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'parseJWT';
         │
         ▼
Agent 输出:
  "parseJWT 定义于 middleware/auth.go:35-48
   调用者: AuthMiddleware (middleware/auth.go:22)
   parseJWT 内部调用: jwt.Parse, jwt.ParseWithClaims
   → 根因: jwt.Parse 在 token 格式错误时返回 nil token
   → 修复: 在 parseJWT 中对 jwt.Parse 返回值增加 nil 检查"
```

#### 场景 4：「找到项目内所有实现了特定接口的类」

```
Agent 输入: "哪些类实现了 io.Closer 接口？"
         │
         ▼
SELECT code_context->>'symbol_name' AS class_name,
       code_context->>'file_path'   AS file
FROM knowledge_items
WHERE code_context->'relations'->'implements' ? 'io.Closer'
  AND metadata->>'project_id' = $current_project;
```

### 4.2 Agent 执行循环

```
         ┌──────────────────────────────────┐
         │         Agent 任务输入             │
         │  "修复 AuthMiddleware 的 token     │
         │   为空时不返回 401 的 bug"          │
         └──────────────┬───────────────────┘
                        │
         ┌──────────────▼───────────────────┐
         │  Step 1: symbol_name 精确查询     │
         │  → 获取 file_path + line_start   │
         │  → 读取 content 源码              │
         └──────────────┬───────────────────┘
                        │
         ┌──────────────▼───────────────────┐
         │  Step 2: relations.called_by     │
         │  → 确认改动影响范围               │
         │  → 列出所有调用点                  │
         └──────────────┬───────────────────┘
                        │
         ┌──────────────▼───────────────────┐
         │  Step 3: relations.calls         │
         │  → 理解内部实现依赖               │
         │  → 判断 bug 根因                  │
         └──────────────┬───────────────────┘
                        │
         ┌──────────────▼───────────────────┐
         │  Step 4: 生成修复代码              │
         │  → 基于 signature + parameters   │
         │  → 基于 doc_comment 理解意图      │
         └──────────────┬───────────────────┘
                        │
         ┌──────────────▼───────────────────┐
         │  Step 5: 遍历 called_by          │
         │  → 检查每个调用点是否需要适配      │
         │  → 更新所有受影响的 KnowledgeItem │
         └──────────────────────────────────┘
```

---

## 五、扩展设计（保留 v1 全部内容，新增 5.4）

### 5.1 新语言 / 新框架的添加策略

方案采用 **开放枚举 + 注册表** 两层机制：

```
                   ┌─────────────────────┐
                   │   metadata.language │
                   │   metadata.framework│
                   └─────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │    Registry（注册表）      │
              │  ┌────────────────────┐  │
              │  │ language_registry  │  │
              │  │ framework_registry │  │
              │  └────────────────────┘  │
              └──────────┬───────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 内置预定义 │  │ 动态注册  │  │ 管理员审核 │
    │ (Schema) │  │ (API 自举)│  │ (Web UI) │
    └──────────┘  └──────────┘  └──────────┘
```

### 5.2 Embedding 模型切换

- `embedding_model` 记录产出向量的模型名+维度
- 切换模型时旧条目标记 `needs_reindex`，后台任务异步重新向量化
- 查询时按模型分组检索后归并

### 5.3 多语言内容扩展

| 策略 | 做法 | 适用场景 |
|------|------|----------|
| **独立条目** | 每种语言一条 KnowledgeItem | 内容差异大 |
| **i18n 嵌入** | Markdown `<!-- lang:zh -->` 区块 | 翻译跟随 |

### 5.4 新语言解析器集成（v2 新增）

```
┌──────────────────────────────────────────────┐
│              代码索引管道                      │
│                                               │
│  Go 源码 ──► go/parser ──► AST ──► ┐          │
│  Python ──► ast.parse ──► AST ──►  ├──► code_context 填充  │
│  Java   ──► javalang ───► AST ──►  │          │
│  Rust   ──► syn ────────► AST ──► ─┘          │
│                                               │
│  新增语言：实现 LanguageParser 接口即可          │
└──────────────────────────────────────────────┘

interface LanguageParser:
    def parse(file_path: str, source: str) -> list[CodeSymbol]:
        """返回该文件中所有可索引的符号"""
```

---

## 六、示例数据

### 示例 1：Go Gin 中间件 — 含完整代码知识图谱（v2 重点示例）

**源文件 `middleware/auth.go`：**

```go
package middleware

import (
    "net/http"
    "strings"
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID   int64  `json:"user_id"`
    Username string `json:"username"`
    jwt.RegisteredClaims
}

// AuthMiddleware validates JWT tokens and injects user claims into context.
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
            return
        }
        token = strings.TrimPrefix(token, "Bearer ")
        claims, err := parseJWT(token)
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            return
        }
        c.Set("user", claims)
        c.Next()
    }
}

// parseJWT parses and validates a JWT token string.
func parseJWT(tokenString string) (*Claims, error) {
    claims := &Claims{}
    token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
        return []byte("secret-key"), nil
    })
    if err != nil || !token.Valid {
        return nil, err
    }
    return claims, nil
}
```

---

#### 条目 1-A：`AuthMiddleware` 函数

```json
{
  "id": "0199b0a1-8f1a-7b2c-a3e5-d7f3g9b0c402",
  "content": "func AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader(\"Authorization\")\n        if token == \"\" {\n            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{\"error\": \"missing token\"})\n            return\n        }\n        token = strings.TrimPrefix(token, \"Bearer \")\n        claims, err := parseJWT(token)\n        if err != nil {\n            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{\"error\": \"invalid token\"})\n            return\n        }\n        c.Set(\"user\", claims)\n        c.Next()\n    }\n}",
  "embedding": [0.023, -0.156, 0.891, "..."],
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
    "project_id": "0199b000-0000-7000-0000-000000000001"
  },
  "code_context": {
    "symbol_type": "function",
    "symbol_name": "AuthMiddleware",
    "file_path": "middleware/auth.go",
    "line_start": 16,
    "line_end": 30,
    "signature": "func AuthMiddleware() gin.HandlerFunc",
    "parameters": [],
    "return_type": "gin.HandlerFunc",
    "modifiers": ["exported"],
    "parent_symbol": null,
    "doc_comment": "AuthMiddleware validates JWT tokens and injects user claims into context.",
    "relations": {
      "calls": [
        {"symbol_name": "GetHeader",           "symbol_type": "method",   "file_path": "vendor/github.com/gin-gonic/gin/context.go", "line": 22},
        {"symbol_name": "AbortWithStatusJSON", "symbol_type": "method",   "file_path": "vendor/github.com/gin-gonic/gin/context.go", "line": 24},
        {"symbol_name": "TrimPrefix",          "symbol_type": "function", "file_path": "",                                             "line": 25},
        {"symbol_name": "parseJWT",            "symbol_type": "function", "file_path": "middleware/auth.go",                           "line": 26},
        {"symbol_name": "Set",                 "symbol_type": "method",   "file_path": "vendor/github.com/gin-gonic/gin/context.go", "line": 28},
        {"symbol_name": "Next",                "symbol_type": "method",   "file_path": "vendor/github.com/gin-gonic/gin/context.go", "line": 29}
      ],
      "called_by": [
        {"symbol_name": "SetupRouter", "symbol_type": "function", "file_path": "router/router.go", "line": 15, "project_id": "0199b000-0000-7000-0000-000000000001"},
        {"symbol_name": "main",        "symbol_type": "function", "file_path": "main.go",           "line": 42, "project_id": "0199b000-0000-7000-0000-000000000001"}
      ],
      "imports": [
        {"module": "net/http",     "alias": "http"},
        {"module": "strings",      "alias": null},
        {"module": "github.com/golang-jwt/jwt/v5", "alias": "jwt"}
      ],
      "extends": null,
      "implements": [],
      "instantiates": [],
      "type_refs": [
        {"symbol_name": "HandlerFunc", "symbol_type": "type", "file_path": "vendor/github.com/gin-gonic/gin/gin.go"},
        {"symbol_name": "Context",     "symbol_type": "type", "file_path": "vendor/github.com/gin-gonic/gin/context.go"}
      ]
    }
  },
  "created_at": "2026-04-20T03:15:00Z",
  "updated_at": "2026-05-12T09:45:00Z",
  "embedding_model": "text-embedding-3-large@1536"
}
```

---

#### 条目 1-B：`parseJWT` 函数

```json
{
  "id": "0199b0a1-9a2b-7c3d-b4e6-e8f0a1c2d503",
  "content": "func parseJWT(tokenString string) (*Claims, error) {\n    claims := &Claims{}\n    token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {\n        return []byte(\"secret-key\"), nil\n    })\n    if err != nil || !token.Valid {\n        return nil, err\n    }\n    return claims, nil\n}",
  "embedding": [0.045, 0.312, -0.678, "..."],
  "metadata": {
    "domain": "Backend",
    "language": "Go",
    "framework": "Gin",
    "type": "API",
    "topic": "jwt-parsing",
    "tags": ["jwt", "parsing", "token", "authentication", "go"],
    "version": "1.0.0",
    "status": "published",
    "project_id": "0199b000-0000-7000-0000-000000000001"
  },
  "code_context": {
    "symbol_type": "function",
    "symbol_name": "parseJWT",
    "file_path": "middleware/auth.go",
    "line_start": 33,
    "line_end": 42,
    "signature": "func parseJWT(tokenString string) (*Claims, error)",
    "parameters": [
      {"name": "tokenString", "type": "string", "required": true}
    ],
    "return_type": "(*Claims, error)",
    "modifiers": ["unexported"],
    "parent_symbol": null,
    "doc_comment": "parseJWT parses and validates a JWT token string.",
    "relations": {
      "calls": [
        {"symbol_name": "ParseWithClaims", "symbol_type": "function", "file_path": "vendor/github.com/golang-jwt/jwt/v5/parser.go", "line": 36}
      ],
      "called_by": [
        {"symbol_name": "AuthMiddleware", "symbol_type": "function", "file_path": "middleware/auth.go", "line": 26, "project_id": "0199b000-0000-7000-0000-000000000001"}
      ],
      "imports": [
        {"module": "github.com/golang-jwt/jwt/v5", "alias": "jwt"}
      ],
      "extends": null,
      "implements": [],
      "instantiates": [
        {"symbol_name": "Claims", "symbol_type": "type", "file_path": "middleware/auth.go"}
      ],
      "type_refs": [
        {"symbol_name": "Claims", "symbol_type": "type", "file_path": "middleware/auth.go"},
        {"symbol_name": "Token",  "symbol_type": "type", "file_path": "vendor/github.com/golang-jwt/jwt/v5/token.go"}
      ]
    }
  },
  "created_at": "2026-04-20T03:15:00Z",
  "updated_at": "2026-05-12T09:45:00Z",
  "embedding_model": "text-embedding-3-large@1536"
}
```

---

#### 条目 1-C：`Claims` 结构体

```json
{
  "id": "0199b0a1-ab3c-7d4e-c5f6-f9a0b1c2d604",
  "content": "type Claims struct {\n    UserID   int64  `json:\"user_id\"`\n    Username string `json:\"username\"`\n    jwt.RegisteredClaims\n}",
  "embedding": ["..."],
  "metadata": {
    "domain": "Backend",
    "language": "Go",
    "framework": "Gin",
    "type": "Concept",
    "topic": "jwt-claims-struct",
    "tags": ["jwt", "claims", "struct", "go"],
    "version": "1.0.0",
    "status": "published",
    "project_id": "0199b000-0000-7000-0000-000000000001"
  },
  "code_context": {
    "symbol_type": "type",
    "symbol_name": "Claims",
    "file_path": "middleware/auth.go",
    "line_start": 8,
    "line_end": 12,
    "signature": "type Claims struct",
    "parameters": [],
    "return_type": null,
    "modifiers": ["exported"],
    "parent_symbol": null,
    "doc_comment": "",
    "relations": {
      "calls": [],
      "called_by": [],
      "imports": [
        {"module": "github.com/golang-jwt/jwt/v5", "alias": "jwt"}
      ],
      "extends": null,
      "implements": [],
      "instantiates": [],
      "type_refs": [
        {"symbol_name": "RegisteredClaims", "symbol_type": "type", "file_path": "vendor/github.com/golang-jwt/jwt/v5/claims.go"}
      ]
    }
  },
  "created_at": "2026-04-20T03:15:00Z",
  "updated_at": "2026-04-20T03:15:00Z",
  "embedding_model": "text-embedding-3-large@1536"
}
```

**三个条目构成的关系图：**

```
         AuthMiddleware
              │
     ┌────────┼────────┬──────────────┐
     ▼        ▼        ▼              ▼
  GetHeader  TrimPrefix  parseJWT    Set / Next / AbortWithStatusJSON
                            │
                            ▼
                    jwt.ParseWithClaims
                            │
                            ▼
                         Claims (struct)
                            │
                            ▼
                    jwt.RegisteredClaims
```

---

### 示例 2：Android 协程异常处理（纯知识条目，无 code_context）

```json
{
  "id": "0199a8f2-7e3c-7a5b-b1d4-c6e2f8a9b301",
  "content": "## Android 协程异常处理\n\n在 Kotlin 协程中，异常通过 `CoroutineExceptionHandler` 统一捕获...",
  "embedding": [0.023, -0.156, 0.891, "..."],
  "metadata": {
    "domain": "Android",
    "language": "Kotlin",
    "framework": "Jetpack",
    "type": "Tutorial",
    "topic": "coroutine-exception-handling",
    "tags": ["coroutine", "exception", "supervisorScope"],
    "source": "https://developer.android.com/kotlin/coroutines",
    "version": "1.2.0",
    "status": "published",
    "project_id": null
  },
  "code_context": null,
  "created_at": "2026-05-01T08:30:00Z",
  "updated_at": "2026-05-10T14:22:00Z",
  "embedding_model": "text-embedding-3-large@1536"
}
```

> 注意：`code_context: null` — 纯知识条目，不影响原有行为。

---

### 示例 3：PostgreSQL 连接池配置（纯知识条目，无 code_context）

```json
{
  "id": "0199a8f2-9c4d-7e3f-b5a7-e8f9a0b1c503",
  "content": "## PostgreSQL 连接池最佳实践\n\n连接池大小公式：...",
  "embedding": ["..."],
  "metadata": {
    "domain": "Database",
    "language": "SQL",
    "framework": "None",
    "type": "Concept",
    "topic": "connection-pool-sizing",
    "tags": ["connection-pool", "hikaricp", "postgresql"],
    "version": "1.0.0",
    "status": "published",
    "project_id": null
  },
  "code_context": null,
  "created_at": "2026-05-05T11:00:00Z",
  "updated_at": "2026-05-05T11:00:00Z",
  "embedding_model": "text-embedding-3-large@1536"
}
```

---

## 七、附录：数据库 DDL（PostgreSQL + pgvector，v2 更新）

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE knowledge_items (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    content         TEXT NOT NULL CHECK (char_length(content) > 0),
    embedding       vector(1536),
    metadata        JSONB NOT NULL,
    code_context    JSONB,          -- 【v2 新增】NULL 表示非代码条目
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    embedding_model VARCHAR(64)
);

-- ============== 索引策略 ==============

-- 向量索引
CREATE INDEX idx_kb_embedding ON knowledge_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- metadata GIN
CREATE INDEX idx_kb_metadata ON knowledge_items USING GIN (metadata jsonb_path_ops);

-- 标签数组
CREATE INDEX idx_kb_tags ON knowledge_items USING GIN ((metadata->'tags'));

-- 全文检索
CREATE INDEX idx_kb_content_fts ON knowledge_items USING GIN (to_tsvector('simple', content));

-- 时间
CREATE INDEX idx_kb_updated ON knowledge_items (updated_at DESC);

-- 【v2 新增】项目隔离索引
CREATE INDEX idx_kb_project ON knowledge_items ((metadata->>'project_id'));

-- 【v2 新增】符号名精确查询索引（Agent 定位代码的核心路径）
CREATE INDEX idx_kb_symbol_name ON knowledge_items ((code_context->>'symbol_name'))
  WHERE code_context IS NOT NULL;

-- 【v2 新增】符号类型 + 项目联合索引
CREATE INDEX idx_kb_symbol_type_project ON knowledge_items (
  (code_context->>'symbol_type'),
  (metadata->>'project_id')
) WHERE code_context IS NOT NULL;

-- 【v2 新增】文件路径索引（查找同一文件内的所有符号）
CREATE INDEX idx_kb_file_path ON knowledge_items ((code_context->>'file_path'))
  WHERE code_context IS NOT NULL;

-- 【v2 新增】关系字段 GIN 索引（支持 called_by / calls 查询）
CREATE INDEX idx_kb_relations ON knowledge_items
  USING GIN ((code_context->'relations') jsonb_path_ops)
  WHERE code_context IS NOT NULL;

-- ============== 自动维护 updated_at ==============

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kb_updated
    BEFORE UPDATE ON knowledge_items
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

### 核心查询（v2 Agent 查询模式）

```sql
-- 1. 精确符号定位（Agent 入口查询）
SELECT id, content,
       code_context->>'file_path'  AS file,
       code_context->>'line_start' AS line,
       code_context->>'signature'  AS signature
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'AuthMiddleware'
  AND (metadata->>'project_id' = '0199b000-0000-7000-0000-000000000001'
       OR metadata->>'project_id' IS NULL);

-- 2. 查找调用者（签名变更前的影响分析）
SELECT code_context->'relations'->'called_by' AS callers
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'parseJWT';

-- 3. 查找被调用者（理解函数内部行为）
SELECT code_context->'relations'->'calls' AS callees
FROM knowledge_items
WHERE code_context->>'symbol_name' = 'AuthMiddleware';

-- 4. 查找实现了特定接口的所有类
SELECT code_context->>'symbol_name' AS class_name,
       code_context->>'file_path'   AS file
FROM knowledge_items
WHERE code_context->'relations'->'implements' ? 'io.Closer'
  AND metadata->>'project_id' = '0199b000-0000-7000-0000-000000000001';

-- 5. 语义检索 + 代码类型过滤（混合查询）
SELECT id,
       1 - (embedding <=> query_embedding) AS similarity,
       code_context->>'symbol_name' AS symbol,
       code_context->>'file_path'   AS file
FROM knowledge_items
WHERE code_context IS NOT NULL
  AND code_context->>'symbol_type' IN ('function', 'method')
  AND metadata->>'project_id' = '0199b000-0000-7000-0000-000000000001'
ORDER BY embedding <=> query_embedding
LIMIT 20;

-- 6. 跨项目调用分析
SELECT code_context->>'symbol_name' AS symbol,
       code_context->'relations'->'called_by' AS callers
FROM knowledge_items
WHERE code_context->'relations'->'called_by' @> '[{"project_id": "0199b000-0000-7000-0000-000000000002"}]';
```
