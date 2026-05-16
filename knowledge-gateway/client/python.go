package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type PythonClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewPythonClient(baseURL string) *PythonClient {
	return &PythonClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 600 * time.Second,
		},
	}
}

// --- Index ---

type IndexRequest struct {
	Source     string `json:"source"`
	SourceType string `json:"source_type"`
}

type IndexResponse struct {
	Status       string `json:"status"`
	IndexedCount int    `json:"indexed_count"`
	ChunkCount   int    `json:"chunk_count"`
	BatchID      string `json:"batch_id,omitempty"`
}

func (c *PythonClient) Index(req IndexRequest) (*IndexResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal index request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/index", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("call python /index: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result IndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode index response: %w", err)
	}
	return &result, nil
}

// --- Query ---

type QueryFilters struct {
	Domain    string   `json:"domain,omitempty"`
	Language  string   `json:"language,omitempty"`
	Framework *string  `json:"framework,omitempty"`
	Type      string   `json:"type,omitempty"`
	Topic     string   `json:"topic,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	ProjectID *string  `json:"project_id,omitempty"`
}

type QueryRequest struct {
	Query   string       `json:"query"`
	Filters *QueryFilters `json:"filters,omitempty"`
	TopK    int          `json:"top_k,omitempty"`
}

type Metadata struct {
	Domain    string   `json:"domain"`
	Language  string   `json:"language"`
	Framework string   `json:"framework"`
	Type      string   `json:"type"`
	Topic     string   `json:"topic"`
	Tags      []string `json:"tags"`
	Source    *string  `json:"source"`
	Version   string   `json:"version"`
	Status    string   `json:"status"`
	ProjectID *string  `json:"project_id"`
}

type QueryResultItem struct {
	ID        string   `json:"id"`
	Content   string   `json:"content"`
	Metadata  Metadata `json:"metadata"`
	Score     float64  `json:"score"`
	CreatedAt *string  `json:"created_at,omitempty"`
	UpdatedAt *string  `json:"updated_at,omitempty"`
}

type QueryResponse struct {
	Results []QueryResultItem `json:"results"`
	Count   int               `json:"count"`
}

func (c *PythonClient) Query(req QueryRequest) (*QueryResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal query request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/query", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("call python /query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result QueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode query response: %w", err)
	}
	return &result, nil
}

// --- Health ---

type HealthResponse struct {
	Status string `json:"status"`
}

func (c *PythonClient) Health() (*HealthResponse, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/health")
	if err != nil {
		return nil, fmt.Errorf("call python /health: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode health response: %w", err)
	}
	return &result, nil
}

// --- Upload ---

func (c *PythonClient) Upload(filename string, reader io.Reader) (*IndexResponse, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(part, reader); err != nil {
		return nil, fmt.Errorf("copy file content: %w", err)
	}
	writer.Close()

	req, err := http.NewRequest("POST", c.baseURL+"/index/upload", body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call python /index/upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result IndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode upload response: %w", err)
	}
	return &result, nil
}

// --- SSE Stream variants (no timeout, long-lived connections) ---

func (c *PythonClient) IndexStream(req IndexRequest) (*http.Response, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal index request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", c.baseURL+"/index/stream", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	return http.DefaultClient.Do(httpReq)
}

func (c *PythonClient) UploadStream(filename string, reader io.Reader) (*http.Response, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(part, reader); err != nil {
		return nil, fmt.Errorf("copy file content: %w", err)
	}
	writer.Close()

	httpReq, err := http.NewRequest("POST", c.baseURL+"/index/upload/stream", body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	return http.DefaultClient.Do(httpReq)
}

// --- Delete ---

type DeleteRequest struct {
	BatchID   string   `json:"batch_id,omitempty"`
	Source    string   `json:"source,omitempty"`
	Domain    string   `json:"domain,omitempty"`
	ProjectID string   `json:"project_id,omitempty"`
	IDs       []string `json:"ids,omitempty"`
}

type DeleteResponse struct {
	Status       string `json:"status"`
	DeletedCount int    `json:"deleted_count"`
}

func (c *PythonClient) DeletePoint(id string) (*DeleteResponse, error) {
	req, err := http.NewRequest("DELETE", c.baseURL+"/knowledge/"+id, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call python DELETE /knowledge/{id}: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result DeleteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode delete response: %w", err)
	}
	return &result, nil
}

func (c *PythonClient) DeleteBatch(req DeleteRequest) (*DeleteResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal delete request: %w", err)
	}

	httpReq, err := http.NewRequest("DELETE", c.baseURL+"/knowledge/batch", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call python DELETE /knowledge/batch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result DeleteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode delete batch response: %w", err)
	}
	return &result, nil
}

// --- Cache Stats ---

type CacheStats struct {
	Size   int `json:"size"`
	Hits   int `json:"hits"`
	Misses int `json:"misses"`
	Max    int `json:"max"`
}

func (c *PythonClient) CacheStats() (*CacheStats, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/cache/stats")
	if err != nil {
		return nil, fmt.Errorf("call python /cache/stats: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}

	var result CacheStats
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode cache stats: %w", err)
	}
	return &result, nil
}

// --- Config ---

type ProviderInfo struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	BaseURL  string   `json:"base_url,omitempty"`
	ApiStyle string   `json:"api_style,omitempty"`
	Models   []string `json:"models"`
	Note     string   `json:"note,omitempty"`
}

type DynamicModels struct {
	Source string   `json:"source"`
	Models []string `json:"models"`
	Error  *string  `json:"error,omitempty"`
}

type LLMConfigRequest struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	APIKey   string `json:"api_key"`
}

type LLMConfigResponse struct {
	Provider           string         `json:"provider"`
	Model              string         `json:"model"`
	APIKey             string         `json:"api_key"`
	BaseURL            string         `json:"base_url"`
	AvailableProviders []ProviderInfo `json:"available_providers"`
	DynamicModels      *DynamicModels `json:"dynamic_models,omitempty"`
}

type EmbedConfigRequest struct {
	Mode        string `json:"mode,omitempty"`
	Provider    string `json:"provider,omitempty"`
	Model       string `json:"model"`
	APIKey      string `json:"api_key,omitempty"`
	LocalURL    string `json:"local_url,omitempty"`
	CfAccountID string `json:"cf_account_id,omitempty"`
}

type EmbedFallbackRequest struct {
	Provider    string `json:"provider,omitempty"`
	Model       string `json:"model,omitempty"`
	APIKey      string `json:"api_key,omitempty"`
	LocalURL    string `json:"local_url,omitempty"`
	CfAccountID string `json:"cf_account_id,omitempty"`
}

type EmbedConfigResponse struct {
	Mode                  string         `json:"mode"`
	UseLocal              bool           `json:"use_local"`
	Provider              string         `json:"provider"`
	Model                 string         `json:"model"`
	APIKey                string         `json:"api_key"`
	BaseURL               string         `json:"base_url"`
	LocalURL              string         `json:"local_url"`
	CfAccountID           string         `json:"cf_account_id"`
	FallbackProvider      string         `json:"fallback_provider"`
	FallbackModel         string         `json:"fallback_model"`
	FallbackAPIKey        string         `json:"fallback_api_key"`
	FallbackCfAccountID   string         `json:"fallback_cf_account_id"`
	AvailableProviders     []ProviderInfo `json:"available_providers"`
	DynamicModels         *DynamicModels `json:"dynamic_models,omitempty"`
	FallbackDynamicModels *DynamicModels `json:"fallback_dynamic_models,omitempty"`
	Warning               *string        `json:"warning,omitempty"`
	CacheCleared          bool           `json:"cache_cleared"`
}

func (c *PythonClient) GetLLMConfig() (*LLMConfigResponse, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/config/llm")
	if err != nil {
		return nil, fmt.Errorf("call python GET /config/llm: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result LLMConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &result, nil
}

func (c *PythonClient) PutLLMConfig(req LLMConfigRequest) (*LLMConfigResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequest("PUT", c.baseURL+"/config/llm", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call python PUT /config/llm: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result LLMConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &result, nil
}

func (c *PythonClient) GetEmbedConfig() (*EmbedConfigResponse, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/config/embed")
	if err != nil {
		return nil, fmt.Errorf("call python GET /config/embed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result EmbedConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &result, nil
}

func (c *PythonClient) PutEmbedConfig(req EmbedConfigRequest) (*EmbedConfigResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequest("PUT", c.baseURL+"/config/embed", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call python PUT /config/embed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result EmbedConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &result, nil
}

// --- Embed Fallback ---

func (c *PythonClient) PutEmbedFallback(req EmbedFallbackRequest) (*EmbedConfigResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequest("PUT", c.baseURL+"/config/embed/fallback", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call python PUT /config/embed/fallback: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result EmbedConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode fallback config: %w", err)
	}
	return &result, nil
}

// --- Model Fetching (read-only, no config changes) ---

func (c *PythonClient) GetLLMModels(provider string) (*DynamicModels, error) {
	url := c.baseURL + "/config/llm/models"
	if provider != "" {
		url += "?provider=" + provider
	}
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("call python GET /config/llm/models: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result DynamicModels
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode models: %w", err)
	}
	return &result, nil
}

func (c *PythonClient) GetEmbedModels(provider string, fallback bool) (*DynamicModels, error) {
	url := fmt.Sprintf("%s/config/embed/models?provider=%s&fallback=%v", c.baseURL, provider, fallback)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("call python GET /config/embed/models: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result DynamicModels
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode models: %w", err)
	}
	return &result, nil
}

// --- Toggle ---

type ToggleResponse struct {
	UseLocal bool   `json:"use_local"`
	Message  string `json:"message"`
}

func (c *PythonClient) ToggleEmbed(enabled bool) (*ToggleResponse, error) {
	url := fmt.Sprintf("%s/config/embed/toggle?enabled=%v", c.baseURL, enabled)
	req, err := http.NewRequest("PUT", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call python PUT /config/embed/toggle: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, parsePythonError(resp)
	}
	var result ToggleResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode toggle response: %w", err)
	}
	return &result, nil
}

// --- error ---

type pythonError struct {
	Detail string `json:"detail"`
}

func parsePythonError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	var pyErr pythonError
	if json.Unmarshal(body, &pyErr) == nil && pyErr.Detail != "" {
		return fmt.Errorf("python service error (HTTP %d): %s", resp.StatusCode, pyErr.Detail)
	}
	return fmt.Errorf("python service error (HTTP %d): %s", resp.StatusCode, string(body))
}
