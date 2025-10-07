package server

import (
	"net/http"

	protovalidate "buf.build/go/protovalidate"
	"connectrpc.com/connect"

	"github.com/eslsoft/lession/internal/adapter/transport"
	lessionv1connect "github.com/eslsoft/lession/pkg/api/lession/v1/lessionv1connect"
)

// NewHTTPHandler wires the Connect handlers into a ServeMux ready for serving.
func NewHTTPHandler(
	assetHandler *transport.AssetHandler,
	seriesHandler *transport.SeriesHandler,
	validator protovalidate.Validator,
) http.Handler {
	mux := http.NewServeMux()

	validationInterceptor := transport.NewValidationInterceptor(validator)
	errorInterceptor := transport.NewErrorInterceptor()

	assetPath, assetSvc := lessionv1connect.NewAssetServiceHandler(
		assetHandler,
		connect.WithInterceptors(validationInterceptor, errorInterceptor),
	)
	mux.Handle(assetPath, assetSvc)

	seriesPath, seriesSvc := lessionv1connect.NewSeriesServiceHandler(
		seriesHandler,
		connect.WithInterceptors(validationInterceptor, errorInterceptor),
	)
	mux.Handle(seriesPath, seriesSvc)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	return mux
}
