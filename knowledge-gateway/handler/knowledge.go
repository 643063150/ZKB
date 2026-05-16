package handler

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net/http"

	"knowledge-gateway/client"

	"github.com/gin-gonic/gin"
)

type KnowledgeHandler struct {
	pyClient *client.PythonClient
	qdClient *client.QdrantClient
}

func New(pyClient *client.PythonClient, qdClient *client.QdrantClient) *KnowledgeHandler {
	return &KnowledgeHandler{pyClient: pyClient, qdClient: qdClient}
}

// POST /knowledge/import
func (h *KnowledgeHandler) Import(c *gin.Context) {
	var req client.IndexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[import] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if req.Source == "" || req.SourceType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source and source_type are required"})
		return
	}

	log.Printf("[import] source=%s type=%s", req.Source, req.SourceType)

	result, err := h.pyClient.Index(req)
	if err != nil {
		log.Printf("[import] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[import] success: indexed=%d chunks=%d", result.IndexedCount, result.ChunkCount)
	c.JSON(http.StatusOK, result)
}

// POST /knowledge/upload
func (h *KnowledgeHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		log.Printf("[upload] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	log.Printf("[upload] file=%s size=%d", file.Filename, file.Size)

	src, err := file.Open()
	if err != nil {
		log.Printf("[upload] open file error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open uploaded file"})
		return
	}
	defer src.Close()

	result, err := h.pyClient.Upload(file.Filename, src)
	if err != nil {
		log.Printf("[upload] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[upload] success: indexed=%d chunks=%d", result.IndexedCount, result.ChunkCount)
	c.JSON(http.StatusOK, result)
}

// POST /knowledge/import/stream
func (h *KnowledgeHandler) ImportStream(c *gin.Context) {
	var req client.IndexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[import-stream] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if req.Source == "" || req.SourceType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source and source_type are required"})
		return
	}

	log.Printf("[import-stream] source=%s type=%s", req.Source, req.SourceType)

	resp, err := h.pyClient.IndexStream(req)
	if err != nil {
		log.Printf("[import-stream] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[import-stream] python error HTTP %d: %s", resp.StatusCode, string(body))
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("python error (HTTP %d)", resp.StatusCode)})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(c.Writer, "%s\n", line)
		c.Writer.Flush()
	}
	log.Printf("[import-stream] completed")
}

// POST /knowledge/upload/stream
func (h *KnowledgeHandler) UploadStream(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		log.Printf("[upload-stream] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	log.Printf("[upload-stream] file=%s size=%d", file.Filename, file.Size)

	src, err := file.Open()
	if err != nil {
		log.Printf("[upload-stream] open file error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open uploaded file"})
		return
	}
	defer src.Close()

	resp, err := h.pyClient.UploadStream(file.Filename, src)
	if err != nil {
		log.Printf("[upload-stream] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[upload-stream] python error HTTP %d: %s", resp.StatusCode, string(body))
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("python error (HTTP %d)", resp.StatusCode)})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(c.Writer, "%s\n", line)
		c.Writer.Flush()
	}
	log.Printf("[upload-stream] completed")
}

// DELETE /knowledge/:id
func (h *KnowledgeHandler) DeletePoint(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id is required"})
		return
	}

	log.Printf("[delete] point id=%s", id)

	result, err := h.pyClient.DeletePoint(id)
	if err != nil {
		log.Printf("[delete] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[delete] success: deleted=%d", result.DeletedCount)
	c.JSON(http.StatusOK, result)
}

// GET /config/llm
func (h *KnowledgeHandler) GetLLMConfig(c *gin.Context) {
	result, err := h.pyClient.GetLLMConfig()
	if err != nil {
		log.Printf("[config-llm] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// PUT /config/llm
func (h *KnowledgeHandler) PutLLMConfig(c *gin.Context) {
	var req client.LLMConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	result, err := h.pyClient.PutLLMConfig(req)
	if err != nil {
		log.Printf("[config-llm] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// GET /config/embed
func (h *KnowledgeHandler) GetEmbedConfig(c *gin.Context) {
	result, err := h.pyClient.GetEmbedConfig()
	if err != nil {
		log.Printf("[config-embed] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// PUT /config/embed
func (h *KnowledgeHandler) PutEmbedConfig(c *gin.Context) {
	var req client.EmbedConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	result, err := h.pyClient.PutEmbedConfig(req)
	if err != nil {
		log.Printf("[config-embed] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// PUT /config/embed/toggle
func (h *KnowledgeHandler) ToggleEmbed(c *gin.Context) {
	enabled := c.Query("enabled") == "true"
	result, err := h.pyClient.ToggleEmbed(enabled)
	if err != nil {
		log.Printf("[config-embed-toggle] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// PUT /config/embed/fallback
func (h *KnowledgeHandler) PutEmbedFallback(c *gin.Context) {
	var req client.EmbedFallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	result, err := h.pyClient.PutEmbedFallback(req)
	if err != nil {
		log.Printf("[config-embed-fb] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// GET /config/llm/models
func (h *KnowledgeHandler) GetLLMModels(c *gin.Context) {
	provider := c.Query("provider")
	result, err := h.pyClient.GetLLMModels(provider)
	if err != nil {
		log.Printf("[config-llm-models] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// GET /config/embed/models
func (h *KnowledgeHandler) GetEmbedModels(c *gin.Context) {
	provider := c.Query("provider")
	fallback := c.Query("fallback") == "true"
	result, err := h.pyClient.GetEmbedModels(provider, fallback)
	if err != nil {
		log.Printf("[config-embed-models] python error: %v", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

// DELETE /knowledge/batch
func (h *KnowledgeHandler) DeleteBatch(c *gin.Context) {
	var req client.DeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[delete-batch] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if req.BatchID == "" && req.Source == "" && req.Domain == "" && req.ProjectID == "" && len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one filter is required: batch_id, source, domain, project_id, or ids"})
		return
	}

	log.Printf("[delete-batch] batch_id=%s source=%s domain=%s ids=%d", req.BatchID, req.Source, req.Domain, len(req.IDs))

	result, err := h.pyClient.DeleteBatch(req)
	if err != nil {
		log.Printf("[delete-batch] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[delete-batch] success: deleted=%d", result.DeletedCount)
	c.JSON(http.StatusOK, result)
}

// POST /knowledge/search
func (h *KnowledgeHandler) Search(c *gin.Context) {
	var req client.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[search] bad request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if req.Query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query is required"})
		return
	}

	if req.TopK <= 0 {
		req.TopK = 10
	}
	if req.TopK > 100 {
		req.TopK = 100
	}

	log.Printf("[search] query=%s top_k=%d", req.Query, req.TopK)

	result, err := h.pyClient.Query(req)
	if err != nil {
		log.Printf("[search] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[search] success: count=%d", result.Count)
	c.JSON(http.StatusOK, result)
}

// GET /knowledge/stats
func (h *KnowledgeHandler) Stats(c *gin.Context) {
	health, err := h.pyClient.Health()
	if err != nil {
		log.Printf("[stats] python health error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	collection, err := h.qdClient.GetCollectionInfo()
	if err != nil {
		log.Printf("[stats] qdrant error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"python_service": gin.H{
			"status": health.Status,
		},
		"qdrant": gin.H{
			"collection": gin.H{
				"exists":       collection.Exists,
				"points_count": collection.PointsCount,
			},
		},
	})
}

// GET /knowledge/cache
func (h *KnowledgeHandler) CacheStats(c *gin.Context) {
	result, err := h.pyClient.CacheStats()
	if err != nil {
		log.Printf("[cache] python error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// MetadataAggregation holds counts per metadata field value.
type MetadataAggregation struct {
	Domain    map[string]int `json:"domain"`
	Language  map[string]int `json:"language"`
	Framework map[string]int `json:"framework"`
	Type      map[string]int `json:"type"`
}

// GET /knowledge/graph
func (h *KnowledgeHandler) Graph(c *gin.Context) {
	points, err := h.qdClient.ScrollPoints(500)
	if err != nil {
		log.Printf("[graph] qdrant scroll error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	agg := MetadataAggregation{
		Domain:    make(map[string]int),
		Language:  make(map[string]int),
		Framework: make(map[string]int),
		Type:      make(map[string]int),
	}

	for _, p := range points {
		m := p.Payload.Metadata
		if m.Domain != "" {
			agg.Domain[m.Domain]++
		}
		if m.Language != "" {
			agg.Language[m.Language]++
		}
		if m.Framework != "" {
			agg.Framework[m.Framework]++
		}
		if m.Type != "" {
			agg.Type[m.Type]++
		}
	}

	log.Printf("[graph] aggregated %d points: domains=%d languages=%d frameworks=%d types=%d",
		len(points), len(agg.Domain), len(agg.Language), len(agg.Framework), len(agg.Type))

	c.JSON(http.StatusOK, gin.H{
		"total_points_sampled": len(points),
		"aggregation":         agg,
	})
}
