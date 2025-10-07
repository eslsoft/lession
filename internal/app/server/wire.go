//go:build wireinject

package server

import (
	"github.com/google/wire"

	"github.com/eslsoft/lession/internal/adapter/db"
	"github.com/eslsoft/lession/internal/adapter/media/fake"
	adaptertransport "github.com/eslsoft/lession/internal/adapter/transport"
	"github.com/eslsoft/lession/internal/core"
	"github.com/eslsoft/lession/internal/usecase"
)

// InitializeServer sets up the full HTTP server with all dependencies wired.
func InitializeServer() (*Server, error) {
	wire.Build(
		NewConfig,
		NewEntClient,
		wire.Bind(new(core.AssetRepository), new(*db.AssetRepository)),
		db.NewAssetRepository,
		wire.Bind(new(core.UploadProvider), new(*fake.Provider)),
		NewFakeUploadProvider,
		wire.Bind(new(core.AssetService), new(*usecase.AssetService)),
		usecase.NewAssetService,
		adaptertransport.NewAssetHandler,
		NewHTTPHandler,
		NewServer,
	)
	return nil, nil
}
