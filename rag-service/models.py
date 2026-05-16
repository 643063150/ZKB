from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    URL = "url"
    GITHUB = "github"
    FILEPATH = "filepath"
    GITHUB_REPO = "github_repo"


class IndexRequest(BaseModel):
    source: str = Field(
        ...,
        description="文档来源：URL / GitHub 链接 / GitHub 仓库 / 服务器本地文件路径",
        examples=["https://github.com/gin-gonic/gin"],
    )
    source_type: SourceType = Field(
        ...,
        description="来源类型：url=网页链接, github=GitHub文件, github_repo=GitHub仓库(克隆全部源码), filepath=服务器本地路径",
        examples=["github_repo"],
    )


class QueryFilter(BaseModel):
    domain: Optional[str] = Field(default=None, description="技术领域: Android / Backend / Database / Frontend / DevOps")
    language: Optional[str] = Field(default=None, description="编程语言: Kotlin / Java / Python / Go / SQL / TypeScript / Rust / Swift")
    framework: Optional[str] = Field(default=None, description="框架: Jetpack / Spring / Gin / Flask / FastAPI / Django / React / Vue / Next.js / None")
    type: Optional[str] = Field(default=None, description="内容类型: API / Tutorial / Example / Concept")
    topic: Optional[str] = Field(default=None, description="细粒度主题（小写连字符）")
    tags: Optional[list[str]] = Field(default=None, description="标签过滤（命中任一即匹配）")
    project_id: Optional[str] = Field(default=None, description="项目 ID（多项目隔离）")


class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        description="查询文本（自然语言）",
        examples=["How to handle JWT authentication in Go Gin?"],
    )
    filters: Optional[QueryFilter] = Field(
        default=None,
        description="元数据过滤条件（所有字段可选）",
        examples=[{"domain": "Backend", "language": "Go"}],
    )
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量 (1-100)", examples=[5])


class QueryResult(BaseModel):
    id: str = Field(..., description="知识条目 UUID v7")
    content: str = Field(..., description="匹配的 chunk 内容")
    metadata: dict = Field(..., description="分类元数据 JSON")
    score: float = Field(..., description="余弦相似度 (0~1，越高越相关)")
    created_at: Optional[str] = Field(default=None, description="创建时间 (ISO 8601)")
    updated_at: Optional[str] = Field(default=None, description="更新时间 (ISO 8601)")


class QueryResponse(BaseModel):
    results: list[QueryResult] = Field(default_factory=list, description="匹配结果列表")
    count: int = Field(..., description="返回结果数量")


class ClassifyRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        description="待分类文本",
        examples=['func AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader("Authorization")\n        if token == "" {\n            c.AbortWithStatusJSON(401, gin.H{"error": "missing token"})\n            return\n        }\n        c.Next()\n    }\n}'],
    )


class ClassifyResponse(BaseModel):
    metadata: dict = Field(..., description="符合 KnowledgeItem Schema 的元数据 JSON")


class IndexResponse(BaseModel):
    status: str = Field(..., description="操作状态")
    indexed_count: int = Field(..., description="处理的源文档数量")
    chunk_count: int = Field(..., description="索引的 chunk 数量")
    batch_id: Optional[str] = Field(default=None, description="批次 ID，用于取消/回退整批导入")


class DeleteRequest(BaseModel):
    ids: Optional[list[str]] = Field(default=None, description="要删除的 chunk ID 列表")
    source: Optional[str] = Field(default=None, description="按 source URL 匹配删除")
    batch_id: Optional[str] = Field(default=None, description="按批次 ID 删除整批")
    domain: Optional[str] = Field(default=None, description="按 domain 过滤删除")
    project_id: Optional[str] = Field(default=None, description="按 project_id 过滤删除")


class DeleteResponse(BaseModel):
    status: str = Field(..., description="操作状态")
    deleted_count: int = Field(..., description="已删除的 chunk 数量")


# ------------------------------------------------------------------
# Config models
# ------------------------------------------------------------------


class LLMConfigRequest(BaseModel):
    provider: str = Field(..., description="LLM 服务商 ID")
    model: str = Field(..., description="模型名称（任意字符串）")
    api_key: str = Field(..., description="API Key")


class EmbedConfigRequest(BaseModel):
    """主 Embedding 配置"""
    mode: str = Field(default="provider", description="模式: provider=云服务商, local=本地/自部署")
    provider: str = Field(default="", description="Embedding 服务商 ID（provider 模式必填；local 模式选填）")
    model: str = Field(..., description="Embedding 模型名称（任意字符串）")
    api_key: str = Field(default="", description="API Key（provider 模式必填；local 模式可选，预留）")
    local_url: Optional[str] = Field(default=None, description="本地服务地址（仅 local 模式，如 http://192.168.1.100:11434/v1）")
    cf_account_id: Optional[str] = Field(default=None, description="Cloudflare Account ID（仅 Cloudflare 必填）")


class EmbedFallbackRequest(BaseModel):
    """独立的备用 Embedding 配置"""
    provider: Optional[str] = Field(default=None, description="备用服务商 ID（传 null 或空串=清空）")
    model: Optional[str] = Field(default=None, description="备用模型名称")
    api_key: Optional[str] = Field(default=None, description="备用 API Key")
    local_url: Optional[str] = Field(default=None, description="本地服务地址（仅 local 模式 fallback）")
    cf_account_id: Optional[str] = Field(default=None, description="Cloudflare Account ID（仅备用为 Cloudflare 时需要）")


class ProviderInfo(BaseModel):
    id: str = Field(..., description="服务商 ID")
    name: str = Field(..., description="服务商名称")
    type: str = Field(default="provider", description="provider=云服务商, local=本地部署")
    base_url: str = Field(default="", description="官方 API 端点（云服务商）")
    api_style: str = Field(default="openai", description="API 格式")
    models: list[str] = Field(default_factory=list, description="预设模型（仅供参考）")
    note: str = Field(default="", description="备注（本地部署）")


class DynamicModels(BaseModel):
    source: str = Field(..., description="来源: dynamic=从API获取 / fallback=预设列表 / error=获取失败")
    models: list[str] = Field(default_factory=list)
    error: Optional[str] = Field(default=None, description="获取失败时的错误信息")


class LLMConfigResponse(BaseModel):
    provider: str = Field(..., description="当前服务商 ID")
    model: str = Field(..., description="当前模型")
    api_key: str = Field(..., description="API Key（脱敏）")
    base_url: str = Field(..., description="API 端点")
    available_providers: list[ProviderInfo] = Field(default_factory=list)
    dynamic_models: Optional[DynamicModels] = Field(default=None, description="从 API 动态获取的模型列表")


class EmbedConfigResponse(BaseModel):
    mode: str = Field(default="provider", description="provider=云服务商, local=本地部署")
    use_local: bool = Field(default=False, description="是否启用本地 Embedding 开关")
    provider: str = Field(..., description="当前主服务商 ID")
    model: str = Field(..., description="当前主模型")
    api_key: str = Field(..., description="API Key（脱敏）")
    base_url: str = Field(default="", description="API 端点（云=官方URL, 本地=用户填写）")
    local_url: str = Field(default="", description="本地服务地址（仅 local 模式）")
    cf_account_id: str = Field(default="", description="Cloudflare Account ID（脱敏）")
    fallback_provider: str = Field(default="", description="备用服务商 ID")
    fallback_model: str = Field(default="", description="备用模型")
    fallback_api_key: str = Field(default="", description="备用 API Key（脱敏）")
    fallback_cf_account_id: str = Field(default="", description="备用 Cloudflare Account ID（脱敏）")
    available_providers: list[ProviderInfo] = Field(default_factory=list)
    dynamic_models: Optional[DynamicModels] = Field(default=None, description="主 Provider 动态模型列表")
    fallback_dynamic_models: Optional[DynamicModels] = Field(default=None, description="备用 Provider 动态模型列表")
    warning: Optional[str] = Field(default=None, description="模型变更警告（需重建索引）")
    cache_cleared: bool = Field(default=False, description="是否已清空 Embedding 缓存")
