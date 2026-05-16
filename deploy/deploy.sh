#!/usr/bin/env bash
# =============================================================================
# ZKB 一键部署脚本
#
# 用法:
#   ./deploy.sh docker              Docker Compose 一键部署 (推荐)
#   ./deploy.sh native              裸机部署 (systemd 服务)
#   ./deploy.sh start   [service]   启动全部/指定服务
#   ./deploy.sh stop    [service]   停止全部/指定服务
#   ./deploy.sh restart [service]   重启全部/指定服务
#   ./deploy.sh logs    [service]   查看全部/指定服务日志
#   ./deploy.sh status              查看所有服务状态
#   ./deploy.sh config              交互式修改端口配置
#
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ---- 服务名称列表 -----------------------------------------------------------
SERVICES=("qdrant" "rag" "gateway" "ui")

# ---- 加载 .env --------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a
fi

# ---- 默认端口 ---------------------------------------------------------------
QD_PORT="${QD_PORT:-6333}"
RAG_PORT="${RAG_PORT:-8000}"
GW_PORT="${GW_PORT:-8080}"
UI_PORT="${UI_PORT:-80}"

# =============================================================================
# 子命令: docker
# =============================================================================
cmd_docker() {
    echo -e "${GREEN}=== ZKB Docker Compose 部署 ===${NC}"

    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}未找到 .env，从模板创建...${NC}"
        cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
        echo -e "${YELLOW}请编辑 $ENV_FILE 填入 API Key 后重试${NC}"
        echo -e "  vim $ENV_FILE"
        exit 1
    fi

    cd "$SCRIPT_DIR"
    docker compose up -d --build

    echo ""
    echo -e "${GREEN}部署完成！${NC}"
    echo -e "  前端:  http://localhost:${UI_PORT}"
    echo -e "  API:   http://localhost:${GW_PORT}/knowledge/stats"
    echo -e "  Swagger: http://localhost:${RAG_PORT}/docs"
    echo ""
    echo -e "查看日志: ${CYAN}./deploy.sh logs <qdrant|rag|gateway|ui>${NC}"
    echo -e "查看状态: ${CYAN}./deploy.sh status${NC}"
}

# =============================================================================
# 子命令: native (裸机 systemd)
# =============================================================================
cmd_native() {
    echo -e "${GREEN}=== ZKB 裸机部署 ===${NC}"
    echo -e "${YELLOW}即将创建 systemd 服务文件...${NC}"

    # 检测环境
    check_dep python3 "Python 3.11+" "python3 --version"
    check_dep go "Go 1.26" "go version"
    check_dep node "Node.js 22+" "node --version"
    check_dep npm "npm" "npm --version"
    check_dep git "git" "git --version"
    check_dep docker "Docker" "docker --version"

    # 目标路径
    INSTALL_DIR="${INSTALL_DIR:-/opt/zkb}"
    echo -e "安装目录: ${CYAN}$INSTALL_DIR${NC}"

    # 复制项目文件
    echo "复制项目文件..."
    sudo mkdir -p "$INSTALL_DIR"
    sudo cp -r "$PROJECT_DIR/knowledge-gateway" "$INSTALL_DIR/"
    sudo cp -r "$PROJECT_DIR/rag-service" "$INSTALL_DIR/"
    sudo cp -r "$PROJECT_DIR/zkb-ui" "$INSTALL_DIR/"
    sudo cp -r "$PROJECT_DIR/deploy" "$INSTALL_DIR/"
    sudo cp "$PROJECT_DIR/data-model.md" "$INSTALL_DIR/" 2>/dev/null || true

    # Python venv
    echo "安装 Python 依赖..."
    cd "$INSTALL_DIR/rag-service"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    deactivate

    # 编译 Go Gateway
    echo "编译 Knowledge Gateway..."
    cd "$INSTALL_DIR/knowledge-gateway"
    go mod tidy
    go build -o knowledge-gateway .

    # 构建前端
    echo "构建前端..."
    cd "$INSTALL_DIR/zkb-ui"
    npm ci
    npm run build

    # 配置 .env
    if [ ! -f "$INSTALL_DIR/deploy/.env" ]; then
        cp "$INSTALL_DIR/deploy/.env.example" "$INSTALL_DIR/deploy/.env"
        echo -e "${RED}请编辑 $INSTALL_DIR/deploy/.env 填入 API Key:${NC}"
        echo -e "  sudo vim $INSTALL_DIR/deploy/.env"
        echo -e "完成后重新运行: sudo ./deploy.sh native"
        exit 1
    fi

    # 创建 systemd 服务
    echo "创建 systemd 服务..."
    create_systemd_service "zkb-qdrant" \
        "/usr/bin/docker run -d --name zkb-qdrant --restart unless-stopped -p ${QD_PORT}:6333 -v zkb_qdrant_data:/qdrant/storage qdrant/qdrant" \
        "docker" "docker.service"

    create_systemd_service "zkb-rag" \
        "$INSTALL_DIR/rag-service/venv/bin/uvicorn main:app --host 0.0.0.0 --port ${RAG_PORT} --no-access-log" \
        "$INSTALL_DIR/rag-service"

    create_systemd_service "zkb-gateway" \
        "$INSTALL_DIR/knowledge-gateway/knowledge-gateway" \
        "$INSTALL_DIR/knowledge-gateway"

    create_systemd_service "zkb-ui" \
        "/usr/bin/env node $INSTALL_DIR/zkb-ui/node_modules/.bin/vite preview --host 0.0.0.0 --port ${UI_PORT}" \
        "$INSTALL_DIR/zkb-ui"

    # 重载 systemd 并启动
    sudo systemctl daemon-reload
    for svc in zkb-qdrant zkb-rag zkb-gateway zkb-ui; do
        sudo systemctl enable "$svc"
        sudo systemctl start "$svc"
    done

    echo ""
    echo -e "${GREEN}部署完成！${NC}"
    echo -e "  前端:  http://localhost:${UI_PORT}"
    echo -e "  API:   http://localhost:${GW_PORT}/knowledge/stats"
    echo ""
    echo -e "查看状态: ${CYAN}systemctl status zkb-*${NC}"
    echo -e "查看日志: ${CYAN}journalctl -u zkb-rag -f${NC}"
}

# =============================================================================
# 子命令: start / stop / restart / logs / status
# =============================================================================
cmd_start()   { svc_action start "${1:-}"; }
cmd_stop()    { svc_action stop "${1:-}"; }
cmd_restart() { svc_action restart "${1:-}"; }

cmd_logs() {
    local svc="${1:-}"
    if [ -n "$svc" ]; then
        _sub_logs "$svc"
    else
        # 并发 tail 所有服务
        for s in "${SERVICES[@]}"; do
            echo -e "${CYAN}─── $s ───${NC}"
        done
        echo "(同时显示所有服务日志，Ctrl+C 退出)"
        for s in "${SERVICES[@]}"; do
            _sub_logs "$s" &
        done
        wait
    fi
}

cmd_status() {
    echo -e "${GREEN}=== ZKB 服务状态 ===${NC}"
    echo ""

    # 检查是否为 Docker 模式
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "zkb-"; then
        echo -e "${CYAN}Docker 模式:${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=zkb-"
        echo ""
    fi

    # 检查 systemd 服务
    for svc in zkb-qdrant zkb-rag zkb-gateway zkb-ui; do
        if systemctl is-enabled "$svc" &>/dev/null; then
            echo -e "${CYAN}$svc:${NC} $(systemctl is-active "$svc")"
        fi
    done

    # 端口检查
    echo ""
    echo -e "${CYAN}端口监听:${NC}"
    for port in "$QD_PORT" "$RAG_PORT" "$GW_PORT" "$UI_PORT"; do
        if ss -tlnp | grep -q ":$port "; then
            echo -e "  :$port ${GREEN}✓${NC}"
        else
            echo -e "  :$port ${RED}✗${NC}"
        fi
    done
}

# =============================================================================
# 子命令: config — 交互式修改端口
# =============================================================================
cmd_config() {
    if [ ! -f "$ENV_FILE" ]; then
        cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    fi

    echo -e "${GREEN}=== ZKB 端口配置 ===${NC}"
    echo ""

    _ask_port "Qdrant 向量数据库端口" QD_PORT "$QD_PORT"
    _ask_port "RAG Service 端口"       RAG_PORT "$RAG_PORT"
    _ask_port "Gateway 网关端口"       GW_PORT "$GW_PORT"
    _ask_port "前端 UI 端口"           UI_PORT "$UI_PORT"

    # 写入 .env
    cat > "$ENV_FILE" << EOF
# ZKB 环境配置 ($(date '+%Y-%m-%d %H:%M'))
QD_PORT=${QD_PORT}
RAG_PORT=${RAG_PORT}
GW_PORT=${GW_PORT}
UI_PORT=${UI_PORT}
QDRANT_URL=http://localhost:${QD_PORT}
QDRANT_COLLECTION=knowledge_items
SERVER_PORT=${GW_PORT}
PYTHON_BASE_URL=http://localhost:${RAG_PORT}
LLM_MODEL=LongCat-Flash-Chat
LLM_BASE_URL=https://api.longcat.chat/openai/v1
LLM_API_KEY=
EMBED_MODEL=gemini-embedding-001
EMBED_DIM=3072
EMBED_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
EMBED_API_KEY=
EMBED_MODEL_FALLBACK=
EMBED_BASE_URL_FALLBACK=
EMBED_API_KEY_FALLBACK=
CHUNK_SIZE=1024
CHUNK_OVERLAP=128
EOF

    echo ""
    echo -e "${GREEN}配置已保存到: $ENV_FILE${NC}"
    echo -e "${YELLOW}请编辑该文件填入 LLM_API_KEY 和 EMBED_API_KEY 后重新部署${NC}"
    echo ""
    echo -e "当前端口:"
    echo -e "  Qdrant:     ${CYAN}$QD_PORT${NC}"
    echo -e "  RAG:        ${CYAN}$RAG_PORT${NC}"
    echo -e "  Gateway:    ${CYAN}$GW_PORT${NC}"
    echo -e "  UI:         ${CYAN}$UI_PORT${NC}"
}

# =============================================================================
# 辅助函数
# =============================================================================

_ask_port() {
    local prompt="$1" var="$2" default="$3"
    read -p "$prompt [$default]: " value
    value="${value:-$default}"
    # shellcheck disable=SC2086
    printf -v "$var" '%s' "$value"
}

check_dep() {
    local bin="$1" name="$2" check="$3"
    if ! command -v "$bin" &>/dev/null; then
        echo -e "${RED}未找到 $name ($bin)，请先安装。${NC}"
        echo "  $check"
        exit 1
    fi
    echo -e "  $name ${GREEN}✓${NC} ($(command -v "$bin"))"
}

create_systemd_service() {
    local name="$1" exec_cmd="$2" workdir="$3" after="${4:-network.target}"
    local unit="/etc/systemd/system/${name}.service"
    sudo tee "$unit" > /dev/null << UNIT
[Unit]
Description=$name
After=$after

[Service]
Type=simple
WorkingDirectory=$workdir
ExecStart=$exec_cmd
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
    echo "  $name → $unit"
}

svc_action() {
    local action="$1" svc="${2:-}"

    if [ -n "$svc" ]; then
        _sub_action "$action" "$svc"
    else
        for s in "${SERVICES[@]}"; do
            _sub_action "$action" "$s"
        done
    fi
}

_sub_action() {
    local action="$1" svc="$2"

    # 优先 Docker
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "zkb-$svc"; then
        echo -e "docker compose $action ${CYAN}zkb-$svc${NC}"
        cd "$SCRIPT_DIR"
        case "$action" in
            start)   docker compose start "$svc" 2>/dev/null || docker compose up -d "$svc" ;;
            stop)    docker compose stop "$svc" ;;
            restart) docker compose restart "$svc" ;;
        esac
    elif systemctl is-enabled "zkb-$svc" &>/dev/null; then
        echo -e "systemctl $action ${CYAN}zkb-$svc${NC}"
        sudo systemctl "$action" "zkb-$svc"
    else
        echo -e "${YELLOW}未找到服务: zkb-$svc${NC}"
    fi
}

_sub_logs() {
    local svc="$1"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "zkb-$svc"; then
        docker logs -f "zkb-$svc" 2>&1 | sed "s/^/[${svc}] /"
    elif systemctl is-enabled "zkb-$svc" &>/dev/null; then
        sudo journalctl -u "zkb-$svc" -f 2>&1 | sed "s/^/[${svc}] /"
    else
        echo -e "${YELLOW}[$svc] 未找到运行中的服务${NC}"
    fi
}

# =============================================================================
# 主入口
# =============================================================================
usage() {
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "部署:"
    echo "  docker               Docker Compose 一键部署 (推荐)"
    echo "  native               裸机部署 (systemd)"
    echo ""
    echo "服务管理:"
    echo "  start   [service]    启动全部 / 指定服务 (qdrant|rag|gateway|ui)"
    echo "  stop    [service]    停止全部 / 指定服务"
    echo "  restart [service]    重启全部 / 指定服务"
    echo "  logs    [service]    查看全部 / 指定服务日志"
    echo "  status               查看所有服务状态"
    echo ""
    echo "配置:"
    echo "  config               交互式修改端口 & 生成 .env"
    echo ""
    echo "示例:"
    echo "  $0 config             # 先配置端口和 API Key"
    echo "  $0 docker             # Docker 部署"
    echo "  $0 logs rag           # 查看 RAG 服务日志"
    echo "  $0 start gateway      # 单独启动 Gateway"
    echo "  $0 stop               # 停止全部服务"
}

case "${1:-}" in
    docker)    cmd_docker ;;
    native)    cmd_native ;;
    start)     shift; cmd_start "$@" ;;
    stop)      shift; cmd_stop "$@" ;;
    restart)   shift; cmd_restart "$@" ;;
    logs)      shift; cmd_logs "$@" ;;
    status)    cmd_status ;;
    config)    cmd_config ;;
    -h|--help|help) usage ;;
    *)         echo -e "${RED}未知命令: ${1:-}${NC}"; echo ""; usage; exit 1 ;;
esac
