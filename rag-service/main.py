from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from classifier import MetadataClassifier
from indexer import Indexer
from models import (
    ClassifyRequest,
    ClassifyResponse,
    DeleteRequest,
    DeleteResponse,
    DynamicModels,
    EmbedConfigRequest,
    EmbedConfigResponse,
    EmbedFallbackRequest,
    IndexRequest,
    IndexResponse,
    LLMConfigRequest,
    LLMConfigResponse,
    ProviderInfo,
    QueryRequest,
    QueryResponse,
    QueryResult,
)
from providers import fetch_models, list_providers, is_local_provider
from provider_config import (
    get_embed_config,
    get_llm_config,
    get_use_local,
    set_embed_config,
    set_embed_fallback_config,
    set_llm_config,
    set_use_local,
)
from retriever import Retriever

# ------------------------------------------------------------------
# Global singletons initialized at startup
# ------------------------------------------------------------------
classifier: MetadataClassifier
indexer: Indexer
retriever: Retriever


@asynccontextmanager
async def lifespan(app: FastAPI):
    global classifier, indexer, retriever
    classifier = MetadataClassifier()
    indexer = Indexer(classifier)
    retriever = Retriever()
    yield


app = FastAPI(
    title="RAG Knowledge Service — 知识库检索服务",
    version="1.9.0",
    description="基于 LlamaIndex + Qdrant 的知识处理服务，支持文档导入、语义检索和文本分类。",
    lifespan=lifespan,
)

# ------------------------------------------------------------------
# POST /index
# ------------------------------------------------------------------


@app.post("/index", response_model=IndexResponse, summary="导入文档")
async def index_documents(req: IndexRequest) -> IndexResponse:
    """导入文档（支持 URL / GitHub / 本地文件）

    自动完成：分块 → LLM 元数据分类 → 向量嵌入 → 存入 Qdrant 向量数据库。
    """
    try:
        result = await indexer.index(req.source, req.source_type.value)
        return IndexResponse(status="ok", **result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {e}")


# ------------------------------------------------------------------
# POST /index/upload
# ------------------------------------------------------------------


@app.post("/index/upload", response_model=IndexResponse, summary="上传文件导入")
async def index_upload(file: UploadFile = File(..., description="要导入的文件（支持 .md .py .go .txt 等文本格式）")) -> IndexResponse:
    """上传本地文件直接导入

    文件内容会被自动分块、分类、向量化并存入 Qdrant。
    支持文本类文件：.md / .py / .go / .java / .txt / .json / .yaml 等。
    """
    try:
        text = (await file.read()).decode("utf-8")
        result = await indexer.index_text(text, file.filename or "")
        return IndexResponse(status="ok", **result)
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not UTF-8 text")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {e}")


# ------------------------------------------------------------------
# POST /index/stream  — SSE streaming variant
# ------------------------------------------------------------------


@app.post("/index/stream", summary="导入文档（SSE 流式）")
async def index_stream(req: IndexRequest):
    """导入文档并实时推送处理进度（SSE text/event-stream）

    推送 5 个步骤事件：fetching → chunking → classifying → embedding → storing → done。
    每步附带 step、progress 百分比、message 描述，classifying 步骤附带 meta 分类结果。
    """
    return StreamingResponse(
        indexer.index_stream(req.source, req.source_type.value),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ------------------------------------------------------------------
# POST /index/upload/stream  — SSE streaming variant for file upload
# ------------------------------------------------------------------


@app.post("/index/upload/stream", summary="上传文件导入（SSE 流式）")
async def index_upload_stream(file: UploadFile = File(..., description="要导入的文件")):
    """上传文件并实时推送处理进度（SSE text/event-stream）"""
    try:
        text = (await file.read()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not UTF-8 text")

    return StreamingResponse(
        indexer.index_text_stream(text, file.filename or ""),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ------------------------------------------------------------------
# POST /query
# ------------------------------------------------------------------


@app.post("/query", response_model=QueryResponse, summary="语义检索")
async def query_knowledge(req: QueryRequest) -> QueryResponse:
    """语义检索（支持元数据过滤）

    返回匹配的知识片段，包含内容、分类元数据和相似度评分。
    """
    try:
        filters = req.filters.model_dump(exclude_none=True) if req.filters else {}
        results = await retriever.query(
            query=req.query,
            filters=filters,
            top_k=req.top_k,
        )
        return QueryResponse(
            results=[QueryResult(**r) for r in results],
            count=len(results),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")


# ------------------------------------------------------------------
# POST /classify
# ------------------------------------------------------------------


@app.post("/classify", response_model=ClassifyResponse, summary="文本分类")
async def classify_text(req: ClassifyRequest) -> ClassifyResponse:
    """文本分类 —— 输入任意文本，返回结构化元数据 JSON

    使用内置分类 Prompt + LLM，输出符合 KnowledgeItem Schema 的元数据。
    """
    try:
        metadata = await classifier.classify(req.text)
        metadata.setdefault("source", None)
        metadata.setdefault("version", "1.0.0")
        metadata.setdefault("status", "published")
        metadata.setdefault("project_id", None)
        return ClassifyResponse(metadata=metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


# ------------------------------------------------------------------
# DELETE /knowledge/batch  (MUST be before /knowledge/{point_id})
# ------------------------------------------------------------------


@app.delete("/knowledge/batch", response_model=DeleteResponse, summary="批量删除")
async def delete_batch(req: DeleteRequest) -> DeleteResponse:
    """批量删除知识条目

    支持按 IDs、batch_id、source、domain、project_id 过滤删除。
    至少提供一个过滤条件。
    """
    count = indexer.delete_batch(
        batch_id=req.batch_id or "",
        source=req.source or "",
        domain=req.domain or "",
        project_id=req.project_id or "",
        ids=req.ids,
    )
    if count == 0:
        raise HTTPException(status_code=404, detail="No matching points found")
    return DeleteResponse(status="ok", deleted_count=count)


# ------------------------------------------------------------------
# DELETE /knowledge/{id}
# ------------------------------------------------------------------


@app.delete("/knowledge/{point_id}", response_model=DeleteResponse, summary="删除单条 chunk")
async def delete_point(point_id: str) -> DeleteResponse:
    """按 ID 删除单条知识条目"""
    count = indexer.delete_point(point_id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Point not found: {point_id}")
    return DeleteResponse(status="ok", deleted_count=count)


# ------------------------------------------------------------------
# GET /cache/stats
# ------------------------------------------------------------------


@app.get("/cache/stats", summary="Embedding 缓存统计")
async def cache_stats() -> dict:
    """查看 Embedding 缓存命中率和大小"""
    return indexer.cache_stats()


# ------------------------------------------------------------------
# Config — LLM
# ------------------------------------------------------------------


@app.get("/config/llm", response_model=LLMConfigResponse, summary="查看 LLM 配置")
async def get_llm() -> LLMConfigResponse:
    """返回当前 LLM 配置（不含动态模型列表，需单独调用 /config/llm/models）"""
    cfg = get_llm_config()
    providers = list_providers("llm")
    return LLMConfigResponse(
        provider=cfg["provider"],
        model=cfg["model"],
        api_key=cfg["api_key"][:8] + "***" if cfg["api_key"] else "",
        base_url=cfg["base_url"],
        available_providers=[ProviderInfo(**p) for p in providers],
    )


@app.put("/config/llm", response_model=LLMConfigResponse, summary="保存 LLM 配置")
async def put_llm(req: LLMConfigRequest) -> LLMConfigResponse:
    """手动配置 LLM 服务商。保存后即时生效。模型列表请用 GET /config/llm/models 获取。"""
    try:
        set_llm_config(req.provider, req.model, req.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    global classifier
    classifier._client = None
    cfg = get_llm_config()
    providers = list_providers("llm")
    return LLMConfigResponse(
        provider=cfg["provider"],
        model=cfg["model"],
        api_key=cfg["api_key"][:8] + "***",
        base_url=cfg["base_url"],
        available_providers=[ProviderInfo(**p) for p in providers],
    )


@app.get("/config/llm/models", response_model=DynamicModels, summary="获取 LLM 模型列表")
async def get_llm_models(provider: str = "") -> DynamicModels:
    """用已配置的 API Key 从服务商获取可用 LLM 模型列表。纯查询，不修改任何配置。"""
    cfg = get_llm_config()
    pid = provider or cfg["provider"]
    api_key = cfg["api_key"] if pid == cfg["provider"] else ""
    if not api_key or pid == "none":
        return DynamicModels(source="error", models=[], error="未配置 API Key，无法获取模型列表")
    result = await fetch_models(pid, api_key, "llm")
    return DynamicModels(**result)


# ------------------------------------------------------------------
# Config — Embedding (primary + fallback split)
# ------------------------------------------------------------------


@app.get("/config/embed", response_model=EmbedConfigResponse, summary="查看 Embedding 配置")
async def get_embed() -> EmbedConfigResponse:
    """返回主 + 备用 Embedding 配置。模型列表请用 /config/embed/models 获取。"""
    cfg = get_embed_config()
    providers = list_providers("embed")
    return EmbedConfigResponse(
        mode=cfg.get("mode", "provider"),
        use_local=cfg.get("use_local", False),
        provider=cfg["provider"],
        model=cfg["model"],
        api_key=cfg["api_key"][:8] + "***" if cfg["api_key"] else "",
        base_url=cfg["base_url"],
        local_url=cfg.get("local_url", ""),
        cf_account_id=cfg.get("cf_account_id", "")[:8] + "***" if cfg.get("cf_account_id") else "",
        fallback_provider=cfg["fallback_provider"],
        fallback_model=cfg["fallback_model"],
        fallback_api_key=cfg["fallback_api_key"][:8] + "***" if cfg["fallback_api_key"] else "",
        fallback_cf_account_id=cfg.get("fallback_cf_account_id", "")[:8] + "***" if cfg.get("fallback_cf_account_id") else "",
        available_providers=[ProviderInfo(**p) for p in providers],
    )


@app.put("/config/embed", response_model=EmbedConfigResponse, summary="保存主 Embedding 配置")
async def put_embed(req: EmbedConfigRequest) -> EmbedConfigResponse:
    """仅保存主 Embedding Provider。备用 Provider 请用 PUT /config/embed/fallback。"""
    old_cfg = get_embed_config()
    old_model_key = f"{old_cfg['provider']}:{old_cfg['model']}"
    new_model_key = f"{req.provider}:{req.model}"

    try:
        set_embed_config(
            req.provider, req.model, req.api_key,
            mode=req.mode, local_url=req.local_url or "",
            cf_account_id=req.cf_account_id if req.cf_account_id is not None else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    import embedder as _em
    if _em._embedder is not None:
        _em._embedder.cache_clear()
    _em._embedder = None

    cfg = get_embed_config()
    providers = list_providers("embed")
    warning = None
    if old_model_key != new_model_key and old_cfg["model"]:
        warning = (
            f"Embedding 模型已从 {old_model_key} 切换为 {new_model_key}。"
            f"Qdrant 中现有 {old_model_key} 的向量与新模型不兼容。"
            f"请通过 POST /index 重新导入文档，或调用 DELETE /knowledge/batch 清除旧数据后重建。"
        )

    return EmbedConfigResponse(
        provider=cfg["provider"],
        model=cfg["model"],
        api_key=cfg["api_key"][:8] + "***",
        base_url=cfg["base_url"],
        cf_account_id=cfg.get("cf_account_id", "")[:8] + "***" if cfg.get("cf_account_id") else "",
        fallback_provider=cfg["fallback_provider"],
        fallback_model=cfg["fallback_model"],
        fallback_api_key=cfg["fallback_api_key"][:8] + "***" if cfg["fallback_api_key"] else "",
        fallback_cf_account_id=cfg.get("fallback_cf_account_id", "")[:8] + "***" if cfg.get("fallback_cf_account_id") else "",
        available_providers=[ProviderInfo(**p) for p in providers],
        warning=warning,
        cache_cleared=True,
    )


@app.put("/config/embed/fallback", response_model=EmbedConfigResponse, summary="保存备用 Embedding 配置")
async def put_embed_fallback(req: EmbedFallbackRequest) -> EmbedConfigResponse:
    """仅保存备用 Embedding Provider。主 Provider 不受影响。"""
    set_embed_fallback_config(
        provider=req.provider if req.provider is not None else "",
        model=req.model if req.model is not None else "",
        api_key=req.api_key if req.api_key is not None else "",
        cf_account_id=req.cf_account_id if req.cf_account_id is not None else "",
    )
    # Reset embedder singleton — picks up new fallback config
    import embedder as _em
    if _em._embedder is not None:
        _em._embedder.cache_clear()
    _em._embedder = None

    cfg = get_embed_config()
    providers = list_providers("embed")
    return EmbedConfigResponse(
        provider=cfg["provider"],
        model=cfg["model"],
        api_key=cfg["api_key"][:8] + "***",
        base_url=cfg["base_url"],
        cf_account_id=cfg.get("cf_account_id", "")[:8] + "***" if cfg.get("cf_account_id") else "",
        fallback_provider=cfg["fallback_provider"],
        fallback_model=cfg["fallback_model"],
        fallback_api_key=cfg["fallback_api_key"][:8] + "***" if cfg["fallback_api_key"] else "",
        fallback_cf_account_id=cfg.get("fallback_cf_account_id", "")[:8] + "***" if cfg.get("fallback_cf_account_id") else "",
        available_providers=[ProviderInfo(**p) for p in providers],
    )


@app.put("/config/embed/toggle", summary="切换本地/供应商 Embedding")
async def toggle_embed(enabled: bool = True) -> dict:
    """切换本地 Embedding 开关。
    - enabled=true: 启用本地，供应商配置失效
    - enabled=false: 关闭本地，自动使用供应商配置
    """
    set_use_local(enabled)
    import embedder as _em
    if _em._embedder is not None:
        _em._embedder.cache_clear()
    _em._embedder = None
    return {"use_local": enabled, "message": "已切换至本地 Embedding" if enabled else "已切换至供应商 Embedding"}


@app.get("/config/embed/models", response_model=DynamicModels, summary="获取 Embedding 模型列表")
async def get_embed_models(provider: str = "", fallback: bool = False) -> DynamicModels:
    """用已配置的 API Key 从服务商获取可用 Embedding 模型列表。纯查询，不修改配置。
    - provider: 指定服务商 ID（默认用主 Provider）
    - fallback=true: 获取备用 Provider 的模型列表
    """
    cfg = get_embed_config()

    if fallback:
        pid = cfg["fallback_provider"]
        api_key = cfg.get("fallback_api_key", "")
        base_url = cfg.get("fallback_base_url", "")
        is_local = False
    else:
        pid = provider or cfg["provider"]
        is_local = cfg.get("mode") == "local" or cfg.get("use_local")
        if is_local:
            api_key = cfg.get("api_key", "") or "none"
            base_url = cfg.get("local_url", "")
        else:
            api_key = cfg["api_key"] if (pid == cfg["provider"]) else ""
            base_url = ""

    if not pid:
        return DynamicModels(source="error", models=[], error="未配置 Provider")
    if is_local and not base_url:
        return DynamicModels(source="error", models=[], error="本地模式未配置 local_url")
    if not is_local and not api_key:
        return DynamicModels(source="error", models=[], error="未配置 API Key")

    result = await fetch_models(pid, api_key=api_key, base_url=base_url, for_="embed")
    return DynamicModels(**result)


# ------------------------------------------------------------------
# GET /health
# ------------------------------------------------------------------


@app.get("/health", summary="健康检查")
async def health() -> dict:
    """健康检查"""
    return {"status": "healthy"}
