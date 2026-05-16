from __future__ import annotations

import asyncio
import json
import re

from openai import AsyncOpenAI

from provider_config import get_llm_config


def _provider_label(pid: str) -> str:
    from providers import get_provider
    p = get_provider(pid)
    return p["name"] if p else pid

CLASSIFIER_SYSTEM_PROMPT = """\
You are a document classifier for a multi-technology knowledge base system.

Analyze the given text and output a JSON object with exactly these fields:

{
  "domain": "<one of: Android, Backend, Database, Frontend, DevOps>",
  "language": "<one of: Kotlin, Java, Python, Go, SQL, TypeScript, Rust, Swift>",
  "framework": "<one of: Jetpack, Spring, Gin, Flask, FastAPI, Django, React, Vue, Next.js, Kubernetes, Terraform, None>",
  "type": "<one of: API, Tutorial, Example, Concept>",
  "topic": "<1-128 char concise topic identifier, lowercase, hyphenated>",
  "tags": ["<tag1>", "<tag2>", "..."]
}

Field descriptions:
- domain: Primary technical domain of the content.
- language: Programming language used or most relevant to the content.
- framework: Framework / runtime used. Use "None" if no specific framework applies.
- type: "API" for API/function/symbol references, "Tutorial" for step-by-step guides,
  "Example" for code snippets/examples, "Concept" for theoretical/architectural explanations.
- topic: A short, specific topic slug in lowercase with hyphens (e.g. "jwt-authentication", "connection-pooling").
- tags: 1-20 relevant keyword tags, all lowercase. Be specific and diverse.

Output ONLY the JSON object, nothing else. No markdown fences, no explanation.\
"""

JSON_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


async def _retry_with_backoff(fn, max_retries: int = 3):
    """Retry on rate-limit (429) with exponential backoff."""
    for attempt in range(max_retries):
        try:
            return await fn()
        except Exception as e:
            code = getattr(getattr(e, "status_code", None), "__int__", lambda: 0)()
            if code == 429 and attempt < max_retries - 1:
                wait = 2 ** attempt * 5
                await asyncio.sleep(wait)
                continue
            raise


class MetadataClassifier:
    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None
        self._model: str = ""
        self._provider: str = ""
        self._provider_name: str = ""

    def _ensure_client(self) -> None:
        if self._client is not None:
            return
        cfg = get_llm_config()
        if not cfg["api_key"]:
            raise RuntimeError(
                "LLM API Key 未配置。"
                "请通过 PUT /config/llm 设置，或在 .env 中配置 LLM_API_KEY。"
            )
        self._client = AsyncOpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"], max_retries=0)
        self._model = cfg["model"]
        self._provider = cfg["provider"]
        self._provider_name = _provider_label(cfg["provider"])

    async def classify(self, text: str) -> dict:
        self._ensure_client()
        truncated = text[:8000] if len(text) > 8000 else text

        async def _call():
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Classify this text:\n\n---\n{truncated}\n---"},
                ],
                temperature=0.1,
            )
            raw = response.choices[0].message.content.strip()
            m = JSON_PATTERN.search(raw)
            if m:
                return json.loads(m.group())
            return json.loads(raw)

        try:
            return await _retry_with_backoff(_call)
        except Exception as e:
            code = getattr(e, "status_code", 0)
            ctx = f"[LLM: {self._provider_name} / {self._model}]"
            if code == 429:
                raise RuntimeError(
                    f"{ctx} 余额不足或速率限制。"
                    f"服务商 {self._provider_name} 的 API 配额已耗尽，请切换其他 LLM 服务商或等待配额重置。"
                ) from e
            raise RuntimeError(f"{ctx} {e}") from e

    async def classify_batch(self, texts: list[str]) -> list[dict]:
        results = []
        for text in texts:
            results.append(await self.classify(text))
        return results
