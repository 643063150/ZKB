"""Persistent provider configuration store.

Priority: JSON config file > environment variables (.env)
Config file path: <project_root>/provider_config.json

Structure:
{
  "llm": {"provider": "longcat", "model": "LongCat-Flash-Chat", "api_key": "ak_xxx"},
  "embed": {"provider": "gemini", "model": "gemini-embedding-001", "api_key": "xxx",
            "fallback_provider": "zhipu", "fallback_model": "embedding-2", "fallback_api_key": "xxx"}
}
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock

from config import settings

CONFIG_PATH = Path(os.getenv("PROVIDER_CONFIG_PATH", Path(__file__).parent / "provider_config.json"))

_lock = Lock()


def _read_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _write_config(data: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONFIG_PATH)


# ------------------------------------------------------------------
# LLM config
# ------------------------------------------------------------------


def get_llm_config() -> dict:
    """Return {provider, model, api_key, base_url}. Falls back to env vars."""
    with _lock:
        cfg = _read_config().get("llm", {})

    def _val(key: str, env_default: str = "") -> str:
        if key in cfg:
            return cfg[key]
        return env_default

    return {
        "provider": _val("provider", "none"),
        "model": _val("model", settings.llm_model),
        "api_key": _val("api_key", settings.llm_api_key),
        "base_url": _val("base_url", settings.llm_base_url),
    }


def set_llm_config(provider: str, model: str, api_key: str) -> dict:
    from providers import get_provider, has_models, is_llm_supported
    p = get_provider(provider)
    if not p:
        raise ValueError(f"Unknown provider: {provider}")
    if not is_llm_supported(provider):
        raise ValueError(f"{p['name']} 不支持 LLM 或 API 格式不兼容")
    if not has_models(provider, "llm"):
        raise ValueError(f"{p['name']} 不支持 LLM 模型")
    # Allow any model name (user can manually input or use dynamic fetch)
    base_url = p["base_url"]
    with _lock:
        data = _read_config()
        data["llm"] = {"provider": provider, "model": model, "api_key": api_key, "base_url": base_url}
        _write_config(data)
    return {"provider": provider, "model": model, "api_key": "***", "base_url": base_url}


# ------------------------------------------------------------------
# Embedding config
# ------------------------------------------------------------------


def get_embed_config() -> dict:
    with _lock:
        cfg = _read_config().get("embed", {})

    def _val(key: str, env_default: str = "") -> str:
        if key in cfg:
            return cfg[key]
        return env_default

    return {
        "mode": "local" if cfg.get("use_local") else _val("mode", "provider"),
        "provider": _val("provider", "none"),
        "model": _val("model", settings.embed_model),
        "api_key": _val("api_key", settings.embed_api_key),
        "base_url": _val("base_url", settings.embed_base_url),
        "local_url": _val("local_url", ""),
        "use_local": cfg.get("use_local", False),
        "cf_account_id": _val("cf_account_id", ""),
        "fallback_provider": _val("fallback_provider", ""),
        "fallback_model": _val("fallback_model", settings.embed_model_fallback),
        "fallback_api_key": _val("fallback_api_key", settings.embed_api_key_fallback),
        "fallback_base_url": _val("fallback_base_url", settings.embed_base_url_fallback),
        "fallback_cf_account_id": _val("fallback_cf_account_id", ""),
    }


def set_embed_config(provider: str, model: str, api_key: str,
                     mode: str = "provider", local_url: str = "",
                     fallback_provider: str | None = None,
                     fallback_model: str | None = None,
                     fallback_api_key: str | None = None,
                     cf_account_id: str | None = None) -> dict:
    """Save embed config. None = preserve existing value, '' = clear."""
    from providers import get_provider, is_embed_supported, is_local_provider

    if mode == "local":
        if not local_url:
            raise ValueError("本地模式需要提供 local_url")
        base_url = local_url.rstrip("/")
        if not provider:
            provider = "ollama"  # default local provider
    else:
        p = get_provider(provider)
        if not p:
            raise ValueError(f"Unknown provider: {provider}")
        if not is_embed_supported(provider):
            raise ValueError(f"{p['name']} 不支持 Embedding 或 API 格式不兼容")
        base_url = p["base_url"]

    with _lock:
        data = _read_config()
        existing = data.get("embed", {})

        def _merge(key: str, new_val: str | None) -> str:
            if new_val is not None:
                return new_val
            return existing.get(key, "")

        data["embed"] = {
            "mode": mode,
            "provider": provider, "model": model, "api_key": api_key, "base_url": base_url,
            "local_url": local_url if mode == "local" else "",
            "cf_account_id": _merge("cf_account_id", cf_account_id),
            "fallback_provider": _merge("fallback_provider", fallback_provider),
            "fallback_model": _merge("fallback_model", fallback_model),
            "fallback_api_key": _merge("fallback_api_key", fallback_api_key),
            "fallback_base_url": _merge("fallback_base_url", None),
        }
        # Resolve fallback_base_url
        fb = data["embed"]["fallback_provider"]
        if fb:
            fp = get_provider(fb)
            if fp:
                data["embed"]["fallback_base_url"] = fp["base_url"]
        elif fb == "":
            data["embed"]["fallback_base_url"] = ""

        _write_config(data)
    return {"provider": provider, "model": model, "api_key": "***", "base_url": base_url,
            "fallback_provider": data["embed"]["fallback_provider"]}


def get_use_local() -> bool:
    """Is local embedding mode currently active?"""
    with _lock:
        cfg = _read_config().get("embed", {})
    return cfg.get("use_local", False)


def set_use_local(enabled: bool) -> bool:
    """Toggle local embedding mode. When enabled, provider config is ignored."""
    with _lock:
        data = _read_config()
        if "embed" not in data:
            data["embed"] = {}
        data["embed"]["use_local"] = enabled
        _write_config(data)
    return enabled


def set_embed_fallback_config(provider: str = "", model: str = "",
                               api_key: str = "", cf_account_id: str = "") -> dict:
    """Save ONLY fallback config. Primary fields untouched."""
    from providers import get_provider, is_embed_supported
    base_url = ""
    if provider and is_embed_supported(provider):
        p = get_provider(provider)
        if p:
            base_url = p["base_url"]

    with _lock:
        data = _read_config()
        existing = data.get("embed", {})
        data["embed"] = {
            **existing,
            "fallback_provider": provider,
            "fallback_model": model,
            "fallback_api_key": api_key,
            "fallback_base_url": base_url,
            "fallback_cf_account_id": cf_account_id,
        }
        _write_config(data)
    return {"fallback_provider": provider, "fallback_model": model, "fallback_api_key": "***"}


# ------------------------------------------------------------------
# Runtime helpers — used by Embedder and Classifier at init time
# ------------------------------------------------------------------


def _resolve_llm() -> tuple[str, str, str]:
    """Returns (base_url, api_key, model) for LLM."""
    cfg = get_llm_config()
    api_key = cfg["api_key"]
    if not api_key:
        raise RuntimeError(
            "LLM API Key 未配置。请通过 PUT /config/llm 设置，或在 .env 中配置 LLM_API_KEY。"
        )
    return cfg["base_url"], api_key, cfg["model"]


def _resolve_embed() -> dict:
    """Returns dict with base_url, api_key, model, fallback_* for Embedding."""
    cfg = get_embed_config()
    api_key = cfg["api_key"]
    if not api_key:
        raise RuntimeError(
            "Embedding API Key 未配置。请通过 PUT /config/embed 设置，或在 .env 中配置 EMBED_API_KEY。"
        )
    return cfg
