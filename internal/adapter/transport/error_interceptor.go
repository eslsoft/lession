package transport

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	"github.com/eslsoft/lession/internal/core"
)

// NewErrorInterceptor creates a Connect interceptor that maps domain errors
// to transport-friendly Connect errors.
func NewErrorInterceptor() connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			res, err := next(ctx, req)
			if err == nil {
				return res, nil
			}
			return nil, mapError(err)
		}
	})
}

func mapError(err error) error {
	var connectErr *connect.Error
	if errors.As(err, &connectErr) {
		return err
	}

	switch {
	case errors.Is(err, core.ErrValidation):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, core.ErrInvalidPageToken):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, core.ErrUploadIdentifierRequired):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, core.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, core.ErrUploadInvalidState):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
