package server

import (
	"context"
	"errors"
	"net/http"
	"time"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	"github.com/eslsoft/lession/internal/config"
)

// Server wraps the HTTP server and its dependencies.
type Server struct {
	cfg        config.Config
	httpServer *http.Server
	entClient  *entgenerated.Client
}

// NewServer constructs a Server from the provided dependencies.
func NewServer(cfg config.Config, handler http.Handler, entClient *entgenerated.Client) *Server {
	return &Server{
		cfg: cfg,
		httpServer: &http.Server{
			Addr:    cfg.HTTPAddress,
			Handler: handler,
		},
		entClient: entClient,
	}
}

// Run starts the HTTP server and blocks until the context is cancelled or an error occurs.
func (s *Server) Run(ctx context.Context) error {
	errCh := make(chan error, 1)

	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil {
			errCh <- err
		} else {
			close(errCh)
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(shutdownCtx)
		_ = s.entClient.Close()
		return nil
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			_ = s.entClient.Close()
			return err
		}
		return nil
	}
}
