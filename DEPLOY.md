# ZKB 部署教程

---

## 目录

1. [架构概览](#1-架构概览)
2. [前置要求](#2-前置要求)
3. [快速开始 — Docker Compose（推荐）](#3-快速开始--docker-compose)
4. [裸机部署 — deploy.sh native](#4-裸机部署--deploysh-native)
5. [端口配置教程](#5-端口配置教程)
6. [服务管理 — 启动 / 停止 / 重启 / 日志](#6-服务管理)
7. [环境变量参考](#7-环境变量参考)
8. [常见问题](#8-常见问题)
9. [文件清单](#9-文件清单)

---

## 1. 架构概览

```
浏览器 (:80 或自定义)
    │
    ▼
┌──────────────────────────────────────────┐
│  Nginx (UI 容器内)                        │
│  /           → React SPA 静态文件          │
│  /knowledge/* → 反向代理到 Gateway        │
│  /config/*  → 反向代理到 Gateway          │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  Knowledge Gateway (Go/Gin, :8080)        │
│  统一路由 + 认证 + 限流                   │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  RAG Service (Python/FastAPI, :8000)      │
│  导入管道 + 查询 + 分类 + LLM 管理         │
└──────┬──────────────────┬────────────────┘
       │                  │
┌──────▼──────┐  ┌───────▼─────────────────┐
│  Qdrant      │  │  LLM / Embedding API    │
│  (:6333)     │  │  (外部 OpenAI/Gemini等)  │
│  向量数据库   │  │                          │
└─────────────┘  └─────────────────────────┘
```

**4 个服务：**

| 服务 | 技术栈 | 默认端口 | 说明 |
|------|--------|----------|------|
| **Qdrant** | Docker 官方镜像 | 6333 | 向量数据库 |
| **RAG Service** | Python 3.14 + FastAPI + LlamaIndex | 8000 | 知识处理核心 |
| **Gateway** | Go 1.26 + Gin | 8080 | API 网关 |
| **UI** | React 19 + Vite + Nginx | 80 | 前端 |

---

## 2. 前置要求

| 依赖 | 最低版本 | Docker 部署 | 裸机部署 |
|------|----------|:----------:|:--------:|
| Docker + Docker Compose | 24+ | **必需** | — |
| Python | 3.11+ | — | **必需** |
| Go | 1.26 | — | **必需** |
| Node.js + npm | 22+ | — | **必需** |
| Git | 2+ | — | **必需** |
| LLM API Key | — | **必需** | **必需** |
| Embedding API Key | — | **必需** | **必需** |

### 系统依赖安装

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y git curl

# Docker (官方脚本)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 登出再登入生效

# Go 1.26
wget https://go.dev/dl/go1.26.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.26.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin  # 追加到 ~/.bashrc

# Node.js 22 (via nvm 或 NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 3. 快速开始 — Docker Compose

### 3.1 克隆项目

```bash
git clone <your-repo-url> /opt/zkb
cd /opt/zkb
```

### 3.2 配置

```bash
cd deploy

# 方式一：交互式配置端口 (推荐)
chmod +x deploy.sh
./deploy.sh config

# 方式二：手动复制模板
cp .env.example .env
vim .env  # 至少填入 LLM_API_KEY 和 EMBED_API_KEY
```

### 3.3 一键启动

```bash
./deploy.sh docker
```

首次启动会构建 3 个镜像（rag/gateway/ui），耗时约 3-5 分钟。后续启动只需数秒。

### 3.4 验证

```bash
./deploy.sh status

# 或手动验证
curl http://localhost:8080/knowledge/stats
curl http://localhost:8000/health
curl http://localhost:8000/config/llm
```

浏览器打开 `http://<服务器IP>` 看到前端页面即部署成功。

---

## 4. 裸机部署 — deploy.sh native

适用于无 Docker 环境或需要直接控制进程的场景。

```bash
cd /opt/zkb/deploy

# 1. 先配置
./deploy.sh config
vim .env  # 填入 API Key

# 2. 一键部署 (需要 sudo 创建 systemd 服务)
sudo ./deploy.sh native
```

部署后 4 个服务以 systemd 单元运行：

```bash
systemctl status zkb-qdrant zkb-rag zkb-gateway zkb-ui
```

---

## 5. 端口配置教程

### 5.1 交互式配置

```bash
cd deploy
./deploy.sh config
```

交互式引导：

```
=== ZKB 端口配置 ===

Qdrant 向量数据库端口 [6333]: 6333
RAG Service 端口 [8000]: 8000
Gateway 网关端口 [8080]: 8080
前端 UI 端口 [80]: 8088          ← 比如改成 8088 避免与已有 nginx 冲突

配置已保存到: deploy/.env
```

### 5.2 手动编辑 .env

```bash
vim deploy/.env
```

修改端口：

```bash
QD_PORT=6333
RAG_PORT=8000
GW_PORT=8080
UI_PORT=8088      # 改这里
```

### 5.3 Docker 环境下改端口

```bash
# 1. 修改 .env 中的端口
vim deploy/.env

# 2. 重建并重启
cd deploy
docker compose down
docker compose up -d
```

### 5.4 systemd 环境下改端口

```bash
# 1. 修改 .env 中的端口
vim deploy/.env

# 2. 编辑对应服务的 systemd unit 修改端口参数
sudo systemctl edit zkb-ui --full

# 3. 重载
sudo systemctl daemon-reload
sudo systemctl restart zkb-ui
```

### 5.5 端口冲突检查

```bash
# 部署前检查端口是否被占用
ss -tlnp | grep -E ":(6333|8000|8080|80) "

# 如果有占用，用 ./deploy.sh config 改端口
```

### 5.6 防火墙配置

```bash
# 使用 ufw 的情况
sudo ufw allow 80/tcp      # UI 端口
sudo ufw allow 8080/tcp    # API 端口（如需外部访问）

# 或仅开放 UI 端口（推荐，所有 API 通过 UI 的 nginx 代理）
sudo ufw allow 80/tcp
```

---

## 6. 服务管理

### 6.1 启动服务

```bash
# 启动全部
./deploy.sh start

# 启动指定服务
./deploy.sh start rag       # 启动 RAG Service
./deploy.sh start gateway   # 启动 Gateway
./deploy.sh start ui        # 启动前端
```

### 6.2 停止服务

```bash
# 停止全部
./deploy.sh stop

# 停止指定服务
./deploy.sh stop rag
```

### 6.3 重启服务

```bash
# 重启全部
./deploy.sh restart

# 重启指定服务
./deploy.sh restart gateway
```

### 6.4 查看日志

**这是最重要的日常运维命令。**

```bash
# 同时查看所有服务日志 (Ctrl+C 退出)
./deploy.sh logs

# 查看指定服务日志 (实时跟踪)
./deploy.sh logs rag        # RAG Service 日志
./deploy.sh logs gateway    # Gateway 日志
./deploy.sh logs ui         # Nginx + 前端日志
./deploy.sh logs qdrant     # Qdrant 日志
```

**Docker 模式下直接查看：**

```bash
cd deploy
docker compose logs -f rag          # RAG 日志
docker compose logs -f --tail=100   # 最近 100 行
docker compose logs -f rag gateway  # 同时看两个服务
```

**systemd 模式下直接查看：**

```bash
journalctl -u zkb-rag -f       # RAG 日志
journalctl -u zkb-gateway -f   # Gateway 日志
journalctl -u zkb-ui -f        # UI 日志
```

### 6.5 查看状态

```bash
# 一键检查所有服务 + 端口
./deploy.sh status
```

输出示例：

```
=== ZKB 服务状态 ===

Docker 模式:
NAMES         STATUS              PORTS
zkb-ui        Up 3 hours          0.0.0.0:80->80/tcp
zkb-gateway   Up 3 hours          0.0.0.0:8080->8080/tcp
zkb-rag       Up 3 hours (healthy) 0.0.0.0:8000->8000/tcp
zkb-qdrant    Up 3 hours (healthy) 0.0.0.0:6333->6333/tcp

端口监听:
  :6333 ✓
  :8000 ✓
  :8080 ✓
  :80   ✓
```

---

## 7. 环境变量参考

### 7.1 端口

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QD_PORT` | 6333 | Qdrant REST API 端口 |
| `RAG_PORT` | 8000 | RAG Service 端口 |
| `GW_PORT` | 8080 | Gateway 端口 |
| `UI_PORT` | 80 | 前端 Nginx 端口 |

### 7.2 Qdrant

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QDRANT_URL` | `http://qdrant:6333` (Docker) / `http://localhost:6333` (Native) | Qdrant 服务地址 |
| `QDRANT_COLLECTION` | `knowledge_items` | 集合名称 |

### 7.3 RAG Service

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_MODEL` | `LongCat-Flash-Chat` | 分类用 LLM 模型 |
| `LLM_BASE_URL` | `https://api.longcat.chat/openai/v1` | LLM API 地址 |
| `LLM_API_KEY` | — | **必填** LLM API Key |
| `EMBED_MODEL` | `gemini-embedding-001` | Embedding 模型 |
| `EMBED_DIM` | `3072` | 向量维度 |
| `EMBED_BASE_URL` | — | Embedding API 地址 |
| `EMBED_API_KEY` | — | **必填** Embedding API Key |
| `EMBED_MODEL_FALLBACK` | — | 备用 Embedding 模型 |
| `EMBED_BASE_URL_FALLBACK` | — | 备用 Embedding API 地址 |
| `EMBED_API_KEY_FALLBACK` | — | 备用 Embedding API Key |
| `CHUNK_SIZE` | `1024` | 文本分块大小 |
| `CHUNK_OVERLAP` | `128` | 分块重叠大小 |

### 7.4 Gateway

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_PORT` | `8080` | Gateway 监听端口 |
| `PYTHON_BASE_URL` | `http://rag:8000` (Docker) / `http://localhost:8000` (Native) | RAG 服务地址 |

---

## 8. 常见问题

### Q: 启动后前端页面空白？

```bash
# 检查浏览器控制台是否有 CORS 或 502 错误
# 检查 Gateway 是否正常运行
./deploy.sh logs gateway
./deploy.sh status
```

### Q: 导入时提示 API Key 未配置？

```bash
# 检查 .env 中是否填入了 Key
grep API_KEY deploy/.env

# 运行时可通过 API 动态配置（无需重启）
curl -X PUT http://localhost:8080/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider":"longcat","model":"LongCat-Flash-Chat","api_key":"your-key"}'

curl -X PUT http://localhost:8080/config/embed \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","model":"gemini-embedding-001","api_key":"your-key"}'
```

### Q: 如何切换到本地 Ollama Embedding？

```bash
# 1. 先在另一台机器上启动 Ollama
ollama pull nomic-embed-text

# 2. 配置本地模式
curl -X PUT http://localhost:8080/config/embed \
  -H "Content-Type: application/json" \
  -d '{"mode":"local","provider":"ollama","model":"nomic-embed-text","local_url":"http://192.168.1.100:11434/v1"}'
```

### Q: Qdrant 数据在哪里？

Docker 模式：Docker Volume `zkb_qdrant_data`

```bash
docker volume inspect zkb_qdrant_data
```

### Q: 如何完全卸载？

```bash
# Docker 模式
cd deploy
docker compose down -v  # -v 会删除数据卷
docker rmi zkb-rag zkb-gateway zkb-ui

# systemd 模式
sudo systemctl stop zkb-qdrant zkb-rag zkb-gateway zkb-ui
sudo systemctl disable zkb-qdrant zkb-rag zkb-gateway zkb-ui
sudo rm /etc/systemd/system/zkb-*.service
sudo systemctl daemon-reload
# Qdrant 容器
docker rm -f zkb-qdrant
docker volume rm zkb_qdrant_data
```

---

## 9. 文件清单

```
ZKB/
├── DEPLOY.md                      ← 本文档
├── data-model.md                  ← 数据模型设计
├── deploy/
│   ├── deploy.sh                  ← 一键部署脚本
│   ├── docker-compose.yml         ← Docker Compose 编排
│   ├── Dockerfile.rag             ← RAG Service 镜像
│   ├── Dockerfile.gateway         ← Gateway 镜像
│   ├── Dockerfile.ui              ← 前端 + Nginx 镜像
│   ├── nginx.conf                 ← Nginx 配置
│   └── .env.example               ← 环境变量模板
├── knowledge-gateway/             ← Go 网关源码 (不修改)
│   ├── main.go
│   ├── handler/knowledge.go
│   ├── client/python.go
│   ├── client/qdrant.go
│   ├── config/config.go
│   └── config.yaml
├── rag-service/                   ← Python 知识处理源码 (不修改)
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── classifier.py
│   ├── indexer.py
│   ├── retriever.py
│   ├── embedder.py
│   ├── provider_config.py
│   ├── providers.py
│   └── requirements.txt
└── zkb-ui/                        ← React 前端源码 (不修改)
    ├── src/
    ├── package.json
    └── vite.config.ts
```
