"""Multi-provider embedding with LRU cache and automatic fallback.

Supported: OpenAI-compatible (AsyncOpenAI) + Cloudflare Workers AI (httpx).
Reads config from provider_config.json, falls back to .env.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from hashlib import sha256

import httpx
from openai import AsyncOpenAI

from provider_config import get_embed_config

# Fallback max chars per embedding request, per model
_DEFAULT_MAX_CHARS = 20_000


def _get_max_chars(provider_id: str, model: str) -> int:
    from providers import get_provider
    p = get_provider(provider_id)
    if p and "embed_max_chars" in p:
        return p["embed_max_chars"].get(model, _DEFAULT_MAX_CHARS)
    return _DEFAULT_MAX_CHARS


def _get_embed_dim(provider_id: str, model: str) -> int:
    """Get the target embedding dimension. Returns Qdrant dim to pass as dimensions param."""
    from config import settings
    return settings.embed_dim


def _provider_label(pid: str) -> str:
    from providers import get_provider
    p = get_provider(pid)
    return p["name"] if p else pid


class Embedder:
    def __init__(self) -> None:
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._max_cache = 2048
        self._hits = 0
        self._misses = 0

        # Lazily initialised
        self._provider: str = ""
        self._model: str = ""
        self._api_key: str = ""
        self._base_url: str = ""
        self._cf_account_id: str = ""
        self._openai_client: AsyncOpenAI | None = None
        # fallback
        self._fb_provider: str = ""
        self._fb_model: str = ""
        self._fb_key: str = ""
        self._fb_url: str = ""
        self._fb_cf_account_id: str = ""
        self._fb_client: AsyncOpenAI | None = None

    def _ensure_clients(self) -> None:
        if self._provider:
            return
        cfg = get_embed_config()
        use_local = cfg.get("use_local", False) or cfg.get("mode") == "local"
        if not use_local and not cfg["api_key"]:
            raise RuntimeError(
                "Embedding API Key 未配置。"
                "请通过 PUT /config/embed 设置，或启用本地 Embedding。"
            )
        self._provider = cfg["provider"]
        self._model = cfg["model"]
        self._api_key = cfg["api_key"]
        self._cf_account_id = cfg.get("cf_account_id", "")

        use_local = cfg.get("use_local", False) or cfg.get("mode") == "local"
        if use_local:
            self._base_url = cfg.get("local_url", "")
            if not self._base_url:
                raise RuntimeError("本地 Embedding 模式已启用但未配置 local_url。请先设置本地服务地址。")
        else:
            self._base_url = cfg["base_url"]

        if self._provider != "cloudflare" or use_local:
            self._openai_client = AsyncOpenAI(
                base_url=self._base_url,
                api_key=self._api_key or "none",
                max_retries=0,
            )

        # fallback — inherit primary key if same provider and fallback key is empty
        fb_key = cfg["fallback_api_key"]
        if not fb_key and cfg["fallback_provider"] and cfg["fallback_provider"] == self._provider:
            fb_key = self._api_key
        if fb_key and cfg["fallback_provider"] and cfg["fallback_model"]:
            self._fb_provider = cfg["fallback_provider"]
            self._fb_model = cfg["fallback_model"]
            self._fb_key = fb_key
            self._fb_url = cfg["fallback_base_url"] or cfg["base_url"]
            self._fb_cf_account_id = cfg.get("fallback_cf_account_id", "")
            if cfg["fallback_provider"] != "cloudflare":
                self._fb_client = AsyncOpenAI(base_url=self._fb_url, api_key=self._fb_key, max_retries=0)

    # -- public API ----------------------------------------------------------

    async def embed(self, text: str) -> list[float]:
        key = self._key(text)
        if key in self._cache:
            self._cache.move_to_end(key)
            self._hits += 1
            return self._cache[key]

        self._misses += 1
        self._ensure_clients()
        result = await self._try_embed(text)

        if len(self._cache) >= self._max_cache:
            self._cache.popitem(last=False)
        self._cache[key] = result
        return result

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts, batching API calls for efficiency."""
        if not texts:
            return []
        self._ensure_clients()

        results: list[list[float]] = []
        batch_size = 20  # most local models handle ~20 inputs per request

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                resp = await self._openai_client.embeddings.create(
                    model=self._model, input=batch
                )
                results.extend([d.embedding for d in resp.data])
            except Exception:
                # Fall back to one-at-a-time for this batch
                for t in batch:
                    try:
                        results.append(await self.embed(t))
                    except Exception:
                        results.append([0.0] * 768)  # zero vector placeholder
        return results

    # -- cache stats ---------------------------------------------------------

    def cache_stats(self) -> dict:
        return {"size": len(self._cache), "hits": self._hits,
                "misses": self._misses, "max": self._max_cache}

    def cache_clear(self) -> None:
        self._cache.clear()
        self._hits = 0
        self._misses = 0

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _split_text(text: str, max_chars: int) -> list[str]:
        """Split text into sub-chunks that each fit within max_chars, at word boundaries."""
        chunks = []
        while len(text) > max_chars:
            cut = text.rfind(" ", 0, max_chars)
            if cut == -1:
                cut = max_chars
            chunks.append(text[:cut])
            text = text[cut:].lstrip()
        if text:
            chunks.append(text)
        return chunks

    @staticmethod
    def _key(text: str) -> str:
        return sha256(text.encode()).hexdigest()

    async def _try_embed(self, text: str, attempt: int = 0) -> list[float]:
        if attempt == 0:
            return await self._do_embed(text, self._provider, self._model,
                                        self._api_key, self._base_url, self._cf_account_id)
        else:
            return await self._do_embed(text, self._fb_provider, self._fb_model,
                                        self._fb_key, self._fb_url, self._fb_cf_account_id)

    async def _do_embed(self, text: str, provider: str, model: str,
                        api_key: str, base_url: str, cf_account_id: str) -> list[float]:
        label = _provider_label(provider)
        ctx = f"[Embedding: {label} / {model}]"
        max_chars = _get_max_chars(provider, model)

        # If text exceeds model limit, split into sub-chunks, embed each, average
        if len(text) > max_chars:
            chunks = self._split_text(text, max_chars)
            if len(chunks) == 1:
                text = chunks[0]
            else:
                vecs = []
                for ch in chunks:
                    vecs.append(await self._do_embed(
                        ch, provider, model, api_key, base_url, cf_account_id))
                # Average the vectors
                dim = len(vecs[0])
                return [sum(col) / len(vecs) for col in zip(*vecs)]

        try:
            if provider == "cloudflare":
                return await self._cloudflare_embed(text, model, api_key, cf_account_id)
            else:
                client = self._openai_client if provider == self._provider else self._fb_client
                kwargs = {"model": model, "input": [text]}
                dim = _get_embed_dim(provider, model)
                if dim:
                    kwargs["dimensions"] = dim
                resp = await client.embeddings.create(**kwargs)
                return resp.data[0].embedding
        except Exception as e:
            code = getattr(e, "status_code", 0)
            if provider == self._provider and self._fb_client and code in (429, 500, 502, 503):
                fb_label = _provider_label(self._fb_provider)
                # Log the fallback switch but don't expose internal detail
                await asyncio.sleep(1)
                return await self._try_embed(text, attempt=1)
            if code == 429:
                raise RuntimeError(
                    f"{ctx} 余额不足或速率限制。"
                    f"服务商 {label} 的 API 配额已耗尽。"
                    f"若已配置备用 Embedding Provider，系统将自动切换。"
                    f"也可通过 PUT /config/embed 更换服务商。"
                ) from e
            raise RuntimeError(f"{ctx} {e}") from e

    # -- Cloudflare Workers AI embedding ------------------------------------

    @staticmethod
    async def _cloudflare_embed(text: str, model: str, api_token: str,
                                account_id: str) -> list[float]:
        if not account_id:
            raise RuntimeError(
                "[Embedding: Cloudflare] 需要 Account ID。"
                "请在 PUT /config/embed 时填写 cf_account_id。"
                "Account ID 见 Cloudflare Dashboard 右侧。"
            )
        url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
        headers = {"Authorization": f"Bearer {api_token}"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json={"text": text}, headers=headers)
            if resp.status_code == 403 or resp.status_code == 401:
                raise RuntimeError(
                    "[Embedding: Cloudflare] 认证失败，请检查 API Token 和 Account ID。"
                )
            if resp.status_code == 429:
                raise RuntimeError(
                    "[Embedding: Cloudflare] 余额不足或速率限制。"
                    "Cloudflare Workers AI 配额已耗尽，请切换其他 Embedding Provider。"
                )
            if not resp.is_success:
                try:
                    body = resp.json()
                    errors = body.get("errors", [])
                    err_msg = "; ".join(str(e) for e in errors) if errors else resp.text[:200]
                except Exception:
                    err_msg = resp.text[:200]
                raise RuntimeError(
                    f"[Embedding: Cloudflare / {model}] 请求失败 (HTTP {resp.status_code})。"
                    f"请检查模型名、Account ID 和 API Token 是否正确。详情: {err_msg}"
                )
            data = resp.json()
            if not data.get("success", False):
                errors = data.get("errors", [])
                raise RuntimeError(f"[Embedding: Cloudflare / {model}] API 错误: {errors}")
            result = data["result"]
            vec = result["data"][0]
            return vec


# ---- shared singleton ------------------------------------------------------

_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder
