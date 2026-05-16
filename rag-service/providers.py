"""
AI / Embedding provider definitions.

Two categories:
- type="provider": cloud APIs with known base URLs (OpenAI, Gemini, Zhipu, Cloudflare...)
- type="local": user-hosted (Ollama, LM Studio) — base_url is manually configured
"""

from __future__ import annotations

PROVIDERS: dict[str, dict] = {
    # ---- cloud providers ----
    "openai": {
        "name": "OpenAI", "type": "provider",
        "base_url": "https://api.openai.com/v1",
        "llm_models": ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "embed_models": ["text-embedding-3-large", "text-embedding-3-small", "text-embedding-ada-002"],
        "embed_dim": {"text-embedding-3-large": 3072, "text-embedding-3-small": 1536, "text-embedding-ada-002": 1536},
    },
    "deepseek": {
        "name": "DeepSeek", "type": "provider",
        "base_url": "https://api.deepseek.com/v1",
        "llm_models": ["deepseek-chat", "deepseek-reasoner"],
        "embed_models": [],
    },
    "gemini": {
        "name": "Gemini", "type": "provider",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "llm_models": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3-flash-preview"],
        "embed_models": ["gemini-embedding-001"],
        "embed_dim": {"gemini-embedding-001": 3072},
        "embed_max_chars": {"gemini-embedding-001": 20_000},
    },
    "cloudflare": {
        "name": "Cloudflare Workers AI", "type": "provider",
        "base_url": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}",
        "api_style": "cloudflare",
        "embed_supported": True, "llm_supported": False,
        "llm_models": [],
        "embed_models": ["@cf/baai/bge-base-en-v1.5", "@cf/baai/bge-large-en-v1.5", "@cf/baai/bge-small-en-v1.5"],
        "embed_dim": {"@cf/baai/bge-base-en-v1.5": 768, "@cf/baai/bge-large-en-v1.5": 1024, "@cf/baai/bge-small-en-v1.5": 384},
        "cf_note": "需要 Cloudflare Account ID + API Token。",
    },
    "zhipu": {
        "name": "智谱 (Zhipu)", "type": "provider",
        "base_url": "https://open.bigmodel.cn/api/paas/v4/",
        "llm_models": ["glm-4-air", "GLM-4.5-Air", "glm-4-flash", "glm-4-plus"],
        "embed_models": ["embedding-2", "embedding-3"],
        "embed_dim": {"embedding-2": 1024, "embedding-3": 1024},
    },
    "longcat": {
        "name": "龙猫 (LongCat)", "type": "provider",
        "base_url": "https://api.longcat.chat/openai/v1",
        "llm_models": ["LongCat-Flash-Chat", "LongCat-Flash-Thinking", "LongCat-Flash-Lite", "LongCat-2.0-Preview"],
        "embed_models": [],
    },
    # ---- local providers (user-hosted, base_url configured manually) ----
    "ollama": {
        "name": "Ollama (本地)", "type": "local",
        "note": "本地/远程 Ollama 服务。先 ollama pull <model> 下载模型。推荐: nomic-embed-text (768d), bge-m3 (1024d), mxbai-embed-large (1024d)",
        "embed_dim": {},
    },
    "lmstudio": {
        "name": "LM Studio (本地)", "type": "local",
        "note": "本地/远程 LM Studio。在 LM Studio 中加载 embedding 模型后，可通过 dimensions 参数指定输出维度。",
        "embed_dim": {"text-embedding-nomic-embed-text-v1.5@f32": 768},
    },
    "custom_openai": {
        "name": "自定义 OpenAI 兼容", "type": "local",
        "note": "任意 OpenAI-compatible Embedding 服务（如 text-embeddings-inference, vllm, localai 等）",
        "embed_dim": {},
    },
}


def get_provider(key: str) -> dict | None:
    return PROVIDERS.get(key)


def is_local_provider(provider_id: str) -> bool:
    p = get_provider(provider_id)
    return p is not None and p.get("type") == "local"


def is_cloud_provider(provider_id: str) -> bool:
    p = get_provider(provider_id)
    return p is not None and p.get("type") == "provider"


def list_providers(for_: str = "all", mode: str = "all") -> list[dict]:
    """List providers. for_: 'llm'|'embed'|'all'. mode: 'provider'|'local'|'all'."""
    result = []
    for pid, p in PROVIDERS.items():
        ptype = p.get("type", "provider")
        if mode != "all" and ptype != mode:
            continue
        info = {"id": pid, "name": p["name"], "type": ptype}
        if ptype == "local":
            info["note"] = p.get("note", "")
            info["models"] = []
        else:
            info["base_url"] = p.get("base_url", "")
            info["api_style"] = p.get("api_style", "openai")
        if for_ == "llm":
            info["models"] = p.get("llm_models", [])
            if ptype == "local" or info["models"] or p.get("llm_supported"):
                result.append(info)
        elif for_ == "embed":
            info["models"] = p.get("embed_models", [])
            if ptype == "local" or info["models"] or p.get("embed_supported"):
                result.append(info)
        else:
            info["llm_models"] = p.get("llm_models", [])
            info["embed_models"] = p.get("embed_models", [])
            result.append(info)
    return result


# ------------------------------------------------------------------
# Model fetching
# ------------------------------------------------------------------

async def fetch_models(provider_id: str, api_key: str = "",
                       base_url: str = "", for_: str = "llm") -> dict:
    from openai import AsyncOpenAI

    p = get_provider(provider_id)
    if not p:
        return {"source": "error", "models": [], "error": f"未知: {provider_id}"}

    is_local = p.get("type") == "local"
    if is_local and not base_url:
        return {"source": "error", "models": [],
                "error": "本地 Provider 需要提供 base_url"}

    url = base_url if is_local else p.get("base_url", "")
    key = api_key or "none"

    try:
        client = AsyncOpenAI(base_url=url, api_key=key, max_retries=0)
        resp = await client.models.list()

        def _clean(mid: str) -> str:
            for prefix in ("models/", "publishers/"):
                if mid.startswith(prefix):
                    return mid[len(prefix):]
            return mid

        all_ids = [_clean(m.id) for m in resp.data]
        seen = set()
        all_ids = [m for m in all_ids if not (m in seen or seen.add(m))]

        if for_ == "llm":
            dynamic = [m for m in all_ids
                       if any(kw in m.lower() for kw in
                              ("gpt", "gemini", "glm", "chat", "deepseek", "longcat",
                               "llama", "qwen", "claude", "flash", "pro", "turbo", "reasoner"))
                       and "embed" not in m.lower()]
        else:
            dynamic = [m for m in all_ids
                       if any(kw in m.lower() for kw in ("embed", "bge", "text-embedding", "nomic", "mxbai", "all-MiniLM", "e5"))]

        if dynamic:
            return {"source": "dynamic", "models": dynamic}
        all_clean = [m for m in all_ids if "deprecated" not in m.lower()]
        return {"source": "dynamic", "models": all_clean[:50]}
    except Exception as e:
        fallback = p.get("embed_models" if for_ == "embed" else "llm_models", [])
        return {"source": "fallback", "models": fallback, "error": f"获取失败: {e}"}


def is_embed_supported(provider_id: str) -> bool:
    p = get_provider(provider_id)
    if not p:
        return False
    if p.get("type") == "local":
        return True
    if p.get("api_style") == "openai":
        return len(p.get("embed_models", [])) > 0
    return p.get("embed_supported", False)


def is_llm_supported(provider_id: str) -> bool:
    p = get_provider(provider_id)
    if not p:
        return False
    if p.get("type") == "local":
        return True
    if p.get("api_style") == "openai":
        return len(p.get("llm_models", [])) > 0
    return p.get("llm_supported", False)
