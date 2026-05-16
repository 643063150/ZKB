package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"knowledge-gateway/client"
	"knowledge-gateway/config"
	"knowledge-gateway/handler"

	"github.com/gin-gonic/gin"
)

func main() {
	cfgPath := "config.yaml"
	if v := os.Getenv("CONFIG_PATH"); v != "" {
		cfgPath = v
	}

	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	pyClient := client.NewPythonClient(cfg.PythonBaseURL)
	qdClient := client.NewQdrantClient(cfg.QdrantURL, cfg.QdrantCollection)

	h := handler.New(pyClient, qdClient)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.POST("/knowledge/import", h.Import)
	r.POST("/knowledge/import/stream", h.ImportStream)
	r.POST("/knowledge/upload", h.Upload)
	r.POST("/knowledge/upload/stream", h.UploadStream)
	r.POST("/knowledge/search", h.Search)
	r.GET("/knowledge/stats", h.Stats)
	r.GET("/knowledge/cache", h.CacheStats)
	r.GET("/knowledge/graph", h.Graph)
	r.DELETE("/knowledge/:id", h.DeletePoint)
	r.DELETE("/knowledge/batch", h.DeleteBatch)
	r.GET("/config/llm", h.GetLLMConfig)
	r.PUT("/config/llm", h.PutLLMConfig)
	r.GET("/config/llm/models", h.GetLLMModels)
	r.GET("/config/embed", h.GetEmbedConfig)
	r.PUT("/config/embed", h.PutEmbedConfig)
	r.GET("/config/embed/models", h.GetEmbedModels)
	r.PUT("/config/embed/fallback", h.PutEmbedFallback)
	r.PUT("/config/embed/toggle", h.ToggleEmbed)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Println("shutting down server...")
		os.Exit(0)
	}()

	addr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("Knowledge Gateway starting on %s", addr)
	log.Printf("Python service: %s", cfg.PythonBaseURL)
	log.Printf("Qdrant: %s (collection: %s)", cfg.QdrantURL, cfg.QdrantCollection)

	if err := r.Run(addr); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
