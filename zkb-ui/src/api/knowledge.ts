import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  timeout: 600_000, // 10 分钟，与后端同步接口一致
});

// POST /knowledge/import
export interface ImportRequest {
  source: string;
  source_type: 'url' | 'github' | 'github_repo' | 'filepath';
}

/** Detect GitHub source_type from URL format */
export function detectGitHubSourceType(url: string): 'github' | 'github_repo' {
  // blob URL: github.com/owner/repo/blob/branch/file → single file
  if (/github\.com\/[^/]+\/[^/]+\/blob\//.test(url)) return 'github';
  // repo URL: github.com/owner/repo or github.com/owner/repo/ → clone all
  return 'github_repo';
}

export interface ImportResponse {
  status: string;
  indexed_count: number;
  chunk_count: number;
  batch_id?: string;
}

// DELETE /knowledge/batch
export interface BatchDeleteRequest {
  batch_id?: string;
  source?: string;
  domain?: string;
  project_id?: string;
  ids?: string[];
}

export interface DeleteResponse {
  status: string;
  deleted_count: number;
}

export const deleteKnowledge = (id: string) =>
  api.delete<DeleteResponse>(`/knowledge/${id}`);

export const deleteBatch = (data: BatchDeleteRequest) =>
  api.delete<DeleteResponse>('/knowledge/batch', { data });

export const importKnowledge = (data: ImportRequest) =>
  api.post<ImportResponse>('/knowledge/import', data);

// POST /knowledge/upload (multipart/form-data)
export const uploadKnowledge = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportResponse>('/knowledge/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ── SSE Stream types ──────────────────────────────────────────────

export type StepName = 'batch' | 'fetching' | 'chunking' | 'classifying' | 'embedding' | 'storing' | 'done' | 'error';

export interface ImportStreamEvent {
  step: StepName;
  progress: number;
  message: string;
  meta?: {
    domain?: string;
    language?: string;
    framework?: string;
    type?: string;
    topic?: string;
    tags?: string[];
    batch_id?: string;
  };
  error?: string;
}

// ── SSE stream helpers ────────────────────────────────────────────

function parseSSELine(line: string): ImportStreamEvent | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6)) as ImportStreamEvent;
  } catch {
    return null;
  }
}

async function* readSSEStream(response: Response): AsyncGenerator<ImportStreamEvent> {
  if (!response.ok) {
    const text = await response.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch {}
    throw new Error(msg);
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const event = parseSSELine(line.trim());
      if (event) yield event;
    }
  }
  // flush remaining
  if (buffer.trim()) {
    const event = parseSSELine(buffer.trim());
    if (event) yield event;
  }
}

// POST /knowledge/import/stream
export function streamImport(data: ImportRequest, signal?: AbortSignal) {
  return fetch('/knowledge/import/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  }).then(readSSEStream);
}

// POST /knowledge/upload/stream
export function streamUpload(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append('file', file);
  return fetch('/knowledge/upload/stream', {
    method: 'POST',
    body: form,
    signal,
  }).then(readSSEStream);
}

// POST /knowledge/search
export interface SearchFilters {
  domain?: string | null;
  language?: string | null;
  framework?: string | null;
  type?: string | null;
  topic?: string | null;
  tags?: string[] | null;
  project_id?: string | null;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  top_k?: number;
}

export interface SearchResultItem {
  id: string;
  content: string;
  metadata: {
    domain: string;
    language: string;
    framework: string;
    type: string;
    topic: string;
    tags: string[];
    source: string | null;
    version: string;
    status: string;
    project_id: string | null;
  };
  score: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
  count: number;
}

export const searchKnowledge = (data: SearchRequest) =>
  api.post<SearchResponse>('/knowledge/search', data);

// GET /knowledge/stats
export interface StatsResponse {
  python_service: {
    status: string;
  };
  qdrant: {
    collection: {
      exists: boolean;
      points_count: number;
    };
  };
}

export const getStats = () =>
  api.get<StatsResponse>('/knowledge/stats');

// GET /knowledge/graph
export interface GraphAggregation {
  domain: Record<string, number>;
  language: Record<string, number>;
  framework: Record<string, number>;
  type: Record<string, number>;
}

export interface GraphResponse {
  total_points_sampled: number;
  aggregation: GraphAggregation;
}

export const getGraph = () =>
  api.get<GraphResponse>('/knowledge/graph');

// GET /knowledge/cache
export interface CacheResponse {
  size: number;
  hits: number;
  misses: number;
  max: number;
}

export const getCache = () =>
  api.get<CacheResponse>('/knowledge/cache');

// ── Config endpoints — v1.7.0 ─────────────────────────────────────

export interface ProviderOption {
  id: string;
  name: string;
  type?: 'provider' | 'local';
  base_url: string;
  models: string[];
  api_style?: string;
  note?: string;
}

export interface DynamicModels {
  source: 'dynamic' | 'preset' | 'fallback' | 'error';
  models: string[];
  error: string | null;
}

// GET /config/llm  (dynamic_models deprecated → null)
export interface LLMConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  available_providers: ProviderOption[];
}

// PUT /config/llm
export interface SaveLLMRequest {
  provider: string;
  model: string;
  api_key: string;
}

// GET /config/embed
export interface EmbedConfig {
  mode: 'provider' | 'local';
  use_local: boolean;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  local_url: string;
  cf_account_id: string;
  fallback_provider: string;
  fallback_model: string;
  fallback_api_key: string;
  fallback_cf_account_id: string;
  available_providers: ProviderOption[];
  warning: string | null;
  cache_cleared: boolean;
}

// PUT /config/embed — primary only, supports both modes
export interface SaveEmbedRequest {
  mode?: 'provider' | 'local';
  provider: string;
  model: string;
  api_key?: string;
  cf_account_id?: string;
  local_url?: string;
}

// PUT /config/embed/fallback — fallback only
export interface SaveFallbackRequest {
  provider: string;
  model: string;
  api_key: string;
  cf_account_id?: string;
}

// ── API calls ──

export const getLLMConfig = () =>
  api.get<LLMConfig>('/config/llm');

export const saveLLMConfig = (data: SaveLLMRequest) =>
  api.put<LLMConfig>('/config/llm', data);

// GET /config/llm/models?provider=xxx  (pure query, no save)
export const getLLMModels = (provider?: string) =>
  api.get<DynamicModels>('/config/llm/models', { params: provider ? { provider } : {} });

export const getEmbedConfig = () =>
  api.get<EmbedConfig>('/config/embed');

export const saveEmbedConfig = (data: SaveEmbedRequest) =>
  api.put<EmbedConfig>('/config/embed', data);

// GET /config/embed/models?fallback=true|false  (pure query, no save)
export const getEmbedModels = (fallback?: boolean, provider?: string) =>
  api.get<DynamicModels>('/config/embed/models', { params: { ...(fallback ? { fallback: 'true' } : {}), ...(provider ? { provider } : {}) } });

// PUT /config/embed/fallback
export const saveFallbackConfig = (data: SaveFallbackRequest) =>
  api.put<EmbedConfig>('/config/embed/fallback', data);

// PUT /config/embed/toggle?enabled=true|false
export const toggleEmbedMode = (enabled: boolean) =>
  api.put<{ use_local: boolean; message: string }>('/config/embed/toggle', null, { params: { enabled } });
