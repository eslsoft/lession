package server

import (
	"time"

	"github.com/eslsoft/lession/internal/adapter/media/fake"
	"github.com/eslsoft/lession/internal/config"
)

// NewConfig loads the runtime configuration for dependency injection.
func NewConfig() (config.Config, error) {
	return config.Load()
}

// NewFakeUploadProvider returns a fake upload provider implementation.
func NewFakeUploadProvider() *fake.Provider {
	return fake.NewProvider("https://upload.local", "https://cdn.local", 15*time.Minute)
}
