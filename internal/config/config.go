package config

import (
	"fmt"
	"os"
)

// Config captures the runtime configuration for the service.
type Config struct {
	HTTPAddress string
	DatabaseURL string
}

// Load reads configuration from the environment with sensible defaults.
func Load() (Config, error) {
	cfg := Config{
		HTTPAddress: valueOrDefault(os.Getenv("HTTP_ADDRESS"), ":8080"),
		DatabaseURL: valueOrDefault(os.Getenv("DATABASE_URL"), ""),
	}

	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL must be provided")
	}

	return cfg, nil
}

func valueOrDefault(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}
