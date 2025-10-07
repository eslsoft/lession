package server

import (
	"time"

	protovalidate "buf.build/go/protovalidate"

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

// NewProtoValidator constructs a protovalidate Validator for request validation.
func NewProtoValidator() (protovalidate.Validator, error) {
	return protovalidate.New()
}
