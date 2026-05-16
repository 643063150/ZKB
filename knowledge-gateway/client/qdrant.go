package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type QdrantClient struct {
	baseURL    string
	collection string
	httpClient *http.Client
}

func NewQdrantClient(baseURL, collection string) *QdrantClient {
	return &QdrantClient{
		baseURL:    baseURL,
		collection: collection,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// --- Collection Info ---

type CollectionInfo struct {
	PointsCount int  `json:"points_count"`
	Exists      bool `json:"exists"`
}

type qdrantCollectionResponse struct {
	Result struct {
		PointsCount int `json:"points_count"`
	} `json:"result"`
	Status interface{} `json:"status"`
	Time   float64     `json:"time"`
}

func (c *QdrantClient) GetCollectionInfo() (*CollectionInfo, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/collections/" + c.collection)
	if err != nil {
		return nil, fmt.Errorf("call qdrant get collection: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &CollectionInfo{Exists: false}, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result qdrantCollectionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode qdrant response: %w", err)
	}
	return &CollectionInfo{
		PointsCount: result.Result.PointsCount,
		Exists:      true,
	}, nil
}

// --- Scroll ---

type MetadataPayload struct {
	Domain    string   `json:"domain"`
	Language  string   `json:"language"`
	Framework string   `json:"framework"`
	Type      string   `json:"type"`
	Topic     string   `json:"topic"`
	Tags      []string `json:"tags"`
}

type PointPayload struct {
	Content  string          `json:"content"`
	Metadata MetadataPayload `json:"metadata"`
}

type Point struct {
	ID      string       `json:"id"`
	Payload PointPayload `json:"payload"`
}

type scrollRequest struct {
	Limit      int  `json:"limit"`
	WithVector bool `json:"with_vector"`
}

type scrollResult struct {
	Points []struct {
		ID      string       `json:"id"`
		Payload PointPayload `json:"payload"`
	} `json:"points"`
	NextPageOffset *string `json:"next_page_offset"`
}

type scrollResponse struct {
	Result scrollResult  `json:"result"`
	Status interface{}   `json:"status"`
	Time   float64       `json:"time"`
}

func (c *QdrantClient) ScrollPoints(limit int) ([]Point, error) {
	body, _ := json.Marshal(scrollRequest{Limit: limit, WithVector: false})
	resp, err := c.httpClient.Post(c.baseURL+"/collections/"+c.collection+"/points/scroll", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("call qdrant scroll: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant scroll error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result scrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode qdrant scroll response: %w", err)
	}

	points := make([]Point, len(result.Result.Points))
	for i, p := range result.Result.Points {
		points[i] = Point{ID: p.ID, Payload: p.Payload}
	}
	return points, nil
}
