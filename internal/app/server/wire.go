//go:build wireinject

package server

import (
	"github.com/google/wire"

	"github.com/eslsoft/lession/internal/adapter/db"
	adaptertransport "github.com/eslsoft/lession/internal/adapter/transport"
	"github.com/eslsoft/lession/internal/core"
	"github.com/eslsoft/lession/internal/usecase"
)

// InitializeServer sets up the full HTTP server with all dependencies wired.
func InitializeServer() (*Server, error) {
	wire.Build(
		NewConfig,
		NewEntClient,
		wire.Bind(new(core.LessonRepository), new(*db.LessonRepository)),
		db.NewLessonRepository,
		wire.Bind(new(core.LessonService), new(*usecase.LessonService)),
		usecase.NewLessonService,
		adaptertransport.NewLessonHandler,
		NewHTTPHandler,
		NewServer,
	)
	return nil, nil
}
