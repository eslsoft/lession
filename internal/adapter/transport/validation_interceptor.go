package transport

import (
	"context"
	"fmt"

	protovalidate "buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	"github.com/eslsoft/lession/internal/core"
)

// NewValidationInterceptor validates incoming requests against protobuf rules using ProtoValidate.
func NewValidationInterceptor(validator protovalidate.Validator) connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if validator != nil {
				if msg, ok := req.Any().(proto.Message); ok {
					if err := validator.Validate(msg); err != nil {
						return nil, fmt.Errorf("%w: %s", core.ErrValidation, err.Error())
					}
				}
			}
			return next(ctx, req)
		}
	})
}
