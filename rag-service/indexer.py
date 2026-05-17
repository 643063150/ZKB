from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
import uuid
from bs4 import BeautifulSoup
from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams

import json as _json

from classifier import MetadataClassifier
from config import settings
from embedder import get_embedder


def _sse(step: str, progress: int, message: str, meta: dict | None = None) -> str:
    """Format an SSE event for the import pipeline."""
    payload = {"step": step, "progress": progress, "message": message}
    if meta:
        payload["meta"] = meta
    return f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"

GITHUB_BLOB_RE = re.compile(r"(?:https?://)?github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)")
GITHUB_TREE_RE = re.compile(r"(?:https?://)?github\.com/([^/]+)/([^/]+)/tree/([^/]+)/?(.*)")
GITHUB_REPO_RE = re.compile(r"(?:https?://)?github\.com/([^/]+)/([^/]+)/?$")


def _ensure_protocol(url: str) -> str:
    """Auto-prepend https:// if URL lacks a protocol."""
    if not url.startswith(("http://", "https://")):
        return f"https://{url}"
    return url


def _github_to_raw(url: str) -> str:
    """Convert GitHub URL to raw.githubusercontent.com URL.

    Supports:
    - blob URL → raw file
    - tree URL → raw README.md under that directory
    - repo URL → raw README.md (main branch)
    """
    url = _ensure_protocol(url)

    m = GITHUB_BLOB_RE.match(url)
    if m:
        owner, repo, branch, path = m.groups()
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"

    m = GITHUB_TREE_RE.match(url)
    if m:
        owner, repo, branch, sub = m.groups()
        sub = sub.rstrip("/") if sub else ""
        readme = f"{sub}/README.md" if sub else "README.md"
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{readme}"

    m = GITHUB_REPO_RE.match(url)
    if m:
        owner, repo = m.groups()
        return f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md"

    raise ValueError(
        f"无法解析此 GitHub URL：{url}\n"
        f"支持的格式：\n"
        f"  blob:  https://github.com/<owner>/<repo>/blob/<branch>/<file>\n"
        f"  仓库:  https://github.com/<owner>/<repo>"
    )


# ── HTML / Javadoc detection ──────────────────────────────────────────────────

_HTML_TAG_RE = re.compile(r"<[a-zA-Z][^>]*>")
_CODE_LINE_RE = re.compile(
    r"^s*(public|private|protected|class|interface|enum|import|package|"
    r"return|if|for|while|try|catch|throw|new|final|static|void|int|long|"
    r"String|boolean)",
    re.MULTILINE,
)


def _is_html_javadoc(text: str) -> bool:
    """Detect whether a text chunk is Javadoc HTML rather than real source code."""
    html_tags = len(_HTML_TAG_RE.findall(text))
    code_lines = len(_CODE_LINE_RE.findall(text))
    return html_tags > 10 and html_tags > code_lines * 2


class Indexer:
    def __init__(self, classifier: MetadataClassifier) -> None:
        self.classifier = classifier
        self.qdrant = QdrantClient(url=settings.qdrant_url)
        self.embedder = get_embedder()
        self.splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        self._ensure_collection()

    # ------------------------------------------------------------------
    # Collection lifecycle
    # ------------------------------------------------------------------

    def _ensure_collection(self) -> None:
        existing = {c.name for c in self.qdrant.get_collections().collections}
        if settings.qdrant_collection not in existing:
            self.qdrant.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config=VectorParams(
                    size=settings.embed_dim,
                    distance=Distance.COSINE,
                ),
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def index(self, source: str, source_type: str) -> dict:
        batch_id = str(uuid.uuid7())
        if source_type == "github_repo":
            return await self.index_repo(source, batch_id)
        raw_text = await self._load_source(source, source_type)
        source_val = source if source_type in ("url", "github") else None
        return await self._index_text(raw_text, source_val, batch_id)

    async def index_text(self, text: str, filename: str = "") -> dict:
        batch_id = str(uuid.uuid7())
        return await self._index_text(text, filename if filename else None, batch_id)

    # ------------------------------------------------------------------
    # Streaming variants — SSE async generators
    # ------------------------------------------------------------------

    async def index_stream(self, source: str, source_type: str):
        """SSE stream: 5-step pipeline or repo clone with progress."""
        batch_id = str(uuid.uuid7())
        if source_type == "github_repo":
            async for event in self.index_repo_stream(source, batch_id):
                yield event
            return
        try:
            yield _sse("batch", 0, f"batch_id={batch_id}", meta={"batch_id": batch_id})
            yield _sse("fetching", 5, "正在获取文档...")

            raw_text = await self._load_source(source, source_type)
            yield _sse("fetching", 20, f"文档获取成功 ({len(raw_text)} 字符)")

            source_val = source if source_type in ("url", "github") else None
            async for event in self._index_text_stream(raw_text, source_val, batch_id):
                yield event
        except Exception as e:
            yield _sse("error", 0, str(e))

    async def index_text_stream(self, text: str, filename: str = ""):
        """SSE stream for uploaded file content."""
        batch_id = str(uuid.uuid7())
        try:
            yield _sse("batch", 0, f"batch_id={batch_id}", meta={"batch_id": batch_id})
            yield _sse("fetching", 20, f"文件读取成功: {filename or '(已上传)'} ({len(text)} 字符)")
            async for event in self._index_text_stream(text, filename if filename else None, batch_id):
                yield event
        except Exception as e:
            yield _sse("error", 0, str(e))

    async def _index_text_stream(self, raw_text: str, source: str | None, batch_id: str):
        # Step 2: chunking
        yield _sse("chunking", 25, "正在分块...")
        doc = Document(text=raw_text)
        nodes = self.splitter.get_nodes_from_documents([doc])

        if not nodes:
            yield _sse("error", 0, "文档分块后为空")
            return

        # Filter out Javadoc HTML chunks
        original_count = len(nodes)
        nodes = [n for n in nodes if not _is_html_javadoc(n.text)]
        skipped = original_count - len(nodes)
        if skipped > 0:
            yield _sse("chunking", 38, f"过滤了 {skipped} 个 Javadoc HTML chunk，剩余 {len(nodes)} 个")

        yield _sse("chunking", 40, f"分块完成，共 {len(nodes)} 个 chunk（原 {original_count}，过滤 {skipped}）")

        # Step 3: classifying
        yield _sse("classifying", 45, "LLM 正在分类...")
        base_meta = await self.classifier.classify(raw_text)
        base_meta.setdefault("source", source)
        base_meta.setdefault("version", "1.0.0")
        base_meta.setdefault("status", "published")
        base_meta.setdefault("project_id", None)

        yield _sse("classifying", 60, "分类完成", meta={
            "domain": base_meta.get("domain"),
            "language": base_meta.get("language"),
            "framework": base_meta.get("framework"),
            "type": base_meta.get("type"),
            "topic": base_meta.get("topic"),
            "tags": base_meta.get("tags"),
        })

        # Step 4: embedding + incremental storing (with heartbeat to prevent nginx timeout)
        total = len(nodes)
        embed_start = datetime.now(timezone.utc)
        last_beat = embed_start
        stored = 0
        batch_size = 20

        yield _sse("embedding", 65, f"正在向量化... 共 {total} chunks，预计需 {total * 0.3:.0f}s",
                   meta={"total_chunks": total})

        for i in range(0, total, batch_size):
            batch_nodes = nodes[i : i + batch_size]
            batch_texts = [n.text for n in batch_nodes]
            batch_embs = await self.embedder.embed_batch(batch_texts)

            # Store immediately — no data loss on timeout
            now = datetime.now(timezone.utc).isoformat()
            points = []
            for node, emb in zip(batch_nodes, batch_embs):
                points.append(PointStruct(
                    id=str(uuid.uuid7()), vector=emb,
                    payload={
                        "content": node.text, "metadata": base_meta.copy(),
                        "code_context": None, "batch_id": batch_id,
                        "created_at": now, "updated_at": now,
                        "embedding_model": f"{settings.embed_model}@{settings.embed_dim}",
                    },
                ))
            self.qdrant.upsert(collection_name=settings.qdrant_collection, points=points)
            stored += len(points)

            # Progress + heartbeat every 30s
            elapsed = (datetime.now(timezone.utc) - embed_start).total_seconds()
            done = min(i + batch_size, total)
            eta = (elapsed / done * (total - done)) if done > 0 else 0
            pct = 65 + int((done / total) * 25)
            now_ts = datetime.now(timezone.utc)

            if (now_ts - last_beat).total_seconds() >= 25:
                last_beat = now_ts
                yield _sse("embedding", pct,
                           f"[{done}/{total}] 向量化中... "
                           f"已耗时 {elapsed:.0f}s, 预计剩余 {eta:.0f}s",
                           meta={"done": done, "total": total, "elapsed_s": int(elapsed), "eta_s": int(eta)})

        elapsed = (datetime.now(timezone.utc) - embed_start).total_seconds()
        yield _sse("storing", 95, f"向量化完成: {stored} chunks, 耗时 {elapsed:.0f}s")

        # Done
        yield _sse("done", 100, f"导入完成，共 {stored} 个 chunk，总耗时 {elapsed:.0f}s",
                   meta={"batch_id": batch_id, "total_chunks": stored, "elapsed_s": int(elapsed)})

    async def _index_text(self, raw_text: str, source: str | None, batch_id: str) -> dict:
        doc = Document(text=raw_text)
        nodes = self.splitter.get_nodes_from_documents([doc])

        if not nodes:
            return {"indexed_count": 0, "chunk_count": 0, "batch_id": batch_id}

        # Filter out Javadoc HTML chunks
        nodes = [n for n in nodes if not _is_html_javadoc(n.text)]

        if not nodes:
            return {"indexed_count": 0, "chunk_count": 0, "batch_id": batch_id}

        base_meta = await self.classifier.classify(raw_text)
        base_meta.setdefault("source", source)
        base_meta.setdefault("version", "1.0.0")
        base_meta.setdefault("status", "published")
        base_meta.setdefault("project_id", None)

        total = len(nodes)
        stored = 0
        batch_size = 20

        for i in range(0, total, batch_size):
            batch_nodes = nodes[i : i + batch_size]
            batch_texts = [n.text for n in batch_nodes]
            batch_embs = await self.embedder.embed_batch(batch_texts)

            now = datetime.now(timezone.utc).isoformat()
            points = []
            for node, emb in zip(batch_nodes, batch_embs):
                points.append(PointStruct(
                    id=str(uuid.uuid7()), vector=emb,
                    payload={
                        "content": node.text, "metadata": base_meta.copy(),
                        "code_context": None, "batch_id": batch_id,
                        "created_at": now, "updated_at": now,
                        "embedding_model": f"{settings.embed_model}@{settings.embed_dim}",
                    },
                ))
            self.qdrant.upsert(collection_name=settings.qdrant_collection, points=points)
            stored += len(points)

        return {"indexed_count": 1, "chunk_count": stored, "batch_id": batch_id}

    # ------------------------------------------------------------------
    # Source loading
    # ------------------------------------------------------------------

    async def _load_source(self, source: str, source_type: str) -> str:
        if source_type == "url":
            return await self._fetch_url(_ensure_protocol(source))
        elif source_type == "github":
            raw_url = _github_to_raw(source)
            try:
                return await self._fetch_url(raw_url)
            except Exception as e:
                # 404 fallback: try master branch if main failed
                if "404" in str(e) and "/main/" in raw_url:
                    alt_url = raw_url.replace("/main/", "/master/")
                    try:
                        return await self._fetch_url(alt_url)
                    except Exception:
                        pass  # raise original error below
                msg = (
                    f"GitHub 文件获取失败。请确认文件存在，或使用 blob URL 直接指定路径：\n"
                    f"  {raw_url}\n"
                    f"  原始错误: {e}"
                )
                raise ValueError(msg) from e
        elif source_type == "filepath":
            return self._read_file(source)
        raise ValueError(f"Unknown source_type: {source_type}. "
                         f"Supported: url, github, github_repo, filepath")

    async def _fetch_url(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "text/html" in content_type:
                soup = BeautifulSoup(resp.text, "lxml")
                return soup.get_text("\n", strip=True)
            return resp.text

    @staticmethod
    def _read_file(path: str) -> str:
        filepath = Path(path)
        if not filepath.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return filepath.read_text(encoding="utf-8")

    # ------------------------------------------------------------------
    # GitHub repo → gitingest
    # ------------------------------------------------------------------

    async def index_repo(self, url: str, batch_id: str = "") -> dict:
        """Use gitingest to clone, filter, extract source content — then embed."""
        if not batch_id:
            batch_id = str(uuid.uuid7())
        raw_text = await self._gitingest_ingest(url)
        return await self._index_text(raw_text, url, batch_id)

    async def index_repo_stream(self, url: str, batch_id: str = ""):
        """SSE stream via gitingest: clone -> filter -> classify -> embed."""
        if not batch_id:
            batch_id = str(uuid.uuid7())
        try:
            yield _sse("batch", 0, f"batch_id={batch_id}", meta={"batch_id": batch_id})
            yield _sse("fetching", 5, f"Gitingest 正在克隆并过滤: {url}")
            raw_text = await self._gitingest_ingest(url)
            yield _sse("fetching", 20, f"源码提取完成 ({len(raw_text)} 字符)")
            async for event in self._index_text_stream(raw_text, url, batch_id):
                yield event
        except Exception as e:
            yield _sse("error", 0, str(e))

    # Patterns to exclude from repo imports (tests, docs, build artifacts, Javadoc HTML)
    _GITINGEST_EXCLUDE = [
        # Tests
        "**/test/**", "**/androidTest/**", "**/tests/**", "**/testFixtures/**",
        # Docs & markdown
        "CHANGELOG*", "README*", "*.md", "*.txt",
        # Build artifacts
        "**/build/**", "**/node_modules/**", "**/.git/**",
        "**/vendor/**", "**/dist/**", "**/out/**", "**/target/**",
        # Javadoc / HTML (core fix)
        "**/*.html", "**/*.htm",
        "**/javadoc/**", "**/docs/**", "**/apidoc/**", "**/generated-docs/**",
        # Build system
        "**/*.gradle*", "**/gradle/**", "**/gradlew*", "**/pom.xml",
        # IDE / CI config
        "**/.github/**", "**/.idea/**", "**/.vscode/**",
        # Android resources (non-code)
        "**/res/**", "**/assets/**", "**/META-INF/**",
        # Config files
        "**/*.properties", "**/*.xml", "**/*.yml", "**/*.yaml",
        "**/Makefile", "**/CMakeLists.txt",
        # Misc noise
        "**/*.log", "**/*.lock", "**/.DS_Store", "Thumbs.db",
    ]

    @staticmethod
    async def _gitingest_ingest(url: str) -> str:
        """Run gitingest on a repo URL, return formatted source text."""
        from gitingest import ingest
        url = _ensure_protocol(url)
        _, tree, source_text = await asyncio.to_thread(
            ingest, url, exclude_patterns=Indexer._GITINGEST_EXCLUDE,
        )
        header = f"Repository: {url}\n\nDirectory structure:\n{tree}\n\n"
        return header + source_text

    # ------------------------------------------------------------------
    # Delete
    # Delete
    # ------------------------------------------------------------------

    def delete_point(self, point_id: str) -> int:
        """Delete a single chunk by ID. Returns count deleted."""
        try:
            # Verify the point exists first
            pts = self.qdrant.retrieve(
                collection_name=settings.qdrant_collection, ids=[point_id]
            )
            if not pts:
                return 0
            self.qdrant.delete(
                collection_name=settings.qdrant_collection,
                points_selector=[point_id],
            )
            return 1
        except Exception:
            return 0

    def delete_batch(self, batch_id: str = "", source: str = "",
                     domain: str = "", project_id: str = "",
                     ids: list[str] | None = None) -> int:
        """Batch delete by filters or explicit IDs."""
        if ids:
            try:
                pts = self.qdrant.retrieve(
                    collection_name=settings.qdrant_collection, ids=ids
                )
                count = len(pts)
                if count > 0:
                    self.qdrant.delete(
                        collection_name=settings.qdrant_collection,
                        points_selector=ids,
                    )
                return count
            except Exception:
                return 0

        must_conditions = []
        if batch_id:
            must_conditions.append(
                FieldCondition(key="batch_id", match=MatchValue(value=batch_id))
            )
        if source:
            must_conditions.append(
                FieldCondition(key="metadata.source", match=MatchValue(value=source))
            )
        if domain:
            must_conditions.append(
                FieldCondition(key="metadata.domain", match=MatchValue(value=domain))
            )
        if project_id:
            must_conditions.append(
                FieldCondition(key="metadata.project_id", match=MatchValue(value=project_id))
            )

        if not must_conditions:
            return 0

        try:
            qf = Filter(must=must_conditions)
            # Count before deleting
            pts, _ = self.qdrant.scroll(
                collection_name=settings.qdrant_collection,
                scroll_filter=qf, limit=10000, with_payload=False,
            )
            count = len(pts)
            if count > 0:
                self.qdrant.delete(
                    collection_name=settings.qdrant_collection,
                    points_selector=qf,
                )
            return count
        except Exception:
            return 0

    # ------------------------------------------------------------------
    # Cache stats (delegated to embedder)
    # ------------------------------------------------------------------

    def cache_stats(self) -> dict:
        return self.embedder.cache_stats()

    def cache_clear(self) -> None:
        self.embedder.cache_clear()
