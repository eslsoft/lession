package server

import (
	"context"

	_ "github.com/lib/pq"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	"github.com/eslsoft/lession/internal/config"
)

// NewEntClient establishes an Ent client backed by PostgreSQL and runs migrations.
func NewEntClient(cfg config.Config) (*entgenerated.Client, error) {
	client, err := entgenerated.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	if err := client.Schema.Create(context.Background()); err != nil {
		_ = client.Close()
		return nil, err
	}

	return client, nil
}
