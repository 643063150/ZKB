package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ServerPort       string `yaml:"server_port"`
	PythonBaseURL    string `yaml:"python_base_url"`
	QdrantURL        string `yaml:"qdrant_url"`
	QdrantCollection string `yaml:"qdrant_collection"`
}

func LoadConfig(path string) (*Config, error) {
	cfg := &Config{
		ServerPort:       "8080",
		PythonBaseURL:    "http://localhost:8000",
		QdrantURL:        "http://localhost:6333",
		QdrantCollection: "knowledge_items",
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, nil
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	if v := os.Getenv("SERVER_PORT"); v != "" {
		cfg.ServerPort = v
	}
	if v := os.Getenv("PYTHON_BASE_URL"); v != "" {
		cfg.PythonBaseURL = v
	}
	if v := os.Getenv("QDRANT_URL"); v != "" {
		cfg.QdrantURL = v
	}
	if v := os.Getenv("QDRANT_COLLECTION"); v != "" {
		cfg.QdrantCollection = v
	}

	return cfg, nil
}
