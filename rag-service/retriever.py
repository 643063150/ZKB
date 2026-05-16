from __future__ import annotations

from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

from config import settings
from embedder import get_embedder


class Retriever:
    def __init__(self) -> None:
        self.qdrant = QdrantClient(url=settings.qdrant_url)
        self.embedder = get_embedder()

    async def query(
        self, query: str, filters: dict, top_k: int
    ) -> list[dict]:
        query_vec = await self.embedder.embed(query)
        qdrant_filter = self._build_filter(filters) if filters else None

        results = self.qdrant.query_points(
            collection_name=settings.qdrant_collection,
            query=query_vec,
            query_filter=qdrant_filter,
            limit=top_k,
            with_payload=True,
        )

        return [
            {
                "id": str(r.id),
                "content": r.payload["content"],
                "metadata": r.payload["metadata"],
                "score": round(r.score, 6),
                "created_at": r.payload.get("created_at"),
                "updated_at": r.payload.get("updated_at"),
            }
            for r in results.points
        ]

    # ------------------------------------------------------------------
    # Filter building
    # ------------------------------------------------------------------

    @staticmethod
    def _build_filter(filters: dict) -> Filter | None:
        must_conditions: list[FieldCondition] = []

        scalar_fields = ["domain", "language", "framework", "type", "topic", "project_id"]
        for field in scalar_fields:
            value = filters.get(field)
            if value is not None:
                must_conditions.append(
                    FieldCondition(key=f"metadata.{field}", match=MatchValue(value=value))
                )

        tags = filters.get("tags")
        if tags:
            must_conditions.append(
                FieldCondition(key="metadata.tags", match=MatchAny(any=tags))
            )

        if not must_conditions:
            return None

        return Filter(must=must_conditions)