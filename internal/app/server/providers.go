package server

import "github.com/eslsoft/lession/internal/config"

// NewConfig loads the runtime configuration for dependency injection.
func NewConfig() (config.Config, error) {
	return config.Load()
}
