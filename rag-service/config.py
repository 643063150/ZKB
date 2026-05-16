from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "knowledge_items"

    # LLM (for classification)
    llm_model: str = "LongCat-Flash-Chat"
    llm_base_url: str = "https://api.longcat.chat/openai/v1"
    llm_api_key: str = ""

    # Embedding — primary (Gemini free tier)
    embed_model: str = "gemini-embedding-001"
    embed_dim: int = 3072
    embed_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    embed_api_key: str = ""

    # Embedding — fallback (Zhipu, auto-switch on 429/5xx)
    embed_model_fallback: str = "embedding-2"
    embed_base_url_fallback: str = "https://open.bigmodel.cn/api/paas/v4/"
    embed_api_key_fallback: str = ""

    chunk_size: int = 1024
    chunk_overlap: int = 128


settings = Settings()
