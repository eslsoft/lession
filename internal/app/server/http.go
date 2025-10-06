package server

import (
	"fmt"
	"net/http"

	"github.com/eslsoft/lession/internal/adapter/transport"
	"github.com/eslsoft/lession/pkg/api/lesson/v1/lessonv1connect"
)

// NewHTTPHandler wires the Connect handlers into a ServeMux ready for serving.
func NewHTTPHandler(handler *transport.LessonHandler) http.Handler {
	mux := http.NewServeMux()

	path, svc := lessonv1connect.NewLessonServiceHandler(handler)
	fmt.Println(path)
	mux.Handle(path, svc)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	return mux
}
