package server

import (
	"net/http"

	"connectrpc.com/connect"

	"github.com/eslsoft/lession/internal/adapter/transport"
	lessionv1connect "github.com/eslsoft/lession/pkg/api/lession/v1/lessionv1connect"
)

// NewHTTPHandler wires the Connect handlers into a ServeMux ready for serving.
func NewHTTPHandler(
	assetHandler *transport.AssetHandler,
) http.Handler {
	mux := http.NewServeMux()

	assetPath, assetSvc := lessionv1connect.NewAssetServiceHandler(
		assetHandler,
		connect.WithInterceptors(transport.NewErrorInterceptor()),
	)
	mux.Handle(assetPath, assetSvc)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	return mux
}
