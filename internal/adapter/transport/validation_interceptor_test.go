package transport

import (
	"context"
	"errors"
	"testing"

	protovalidate "buf.build/go/protovalidate"
	"connectrpc.com/connect"

	"github.com/eslsoft/lession/internal/core"
	lessionv1 "github.com/eslsoft/lession/pkg/api/lession/v1"
)

func TestValidationInterceptor_AllowsValidRequest(t *testing.T) {
	validator, err := protovalidate.New()
	if err != nil {
		t.Fatalf("protovalidate.New() error = %v", err)
	}

	interceptor := NewValidationInterceptor(validator)
	nextCalled := false

	unary := interceptor.WrapUnary(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		nextCalled = true
		return connect.NewResponse(&lessionv1.CreateSeriesResponse{}), nil
	})

	req := connect.NewRequest(&lessionv1.CreateSeriesRequest{
		Series: &lessionv1.SeriesDraft{Slug: "intro", Title: "Intro"},
	})

	if _, err := unary(context.Background(), req); err != nil {
		t.Fatalf("unary() error = %v", err)
	}
	if !nextCalled {
		t.Fatal("expected next to be called")
	}
}

func TestValidationInterceptor_InvalidRequestReturnsValidationError(t *testing.T) {
	validator, err := protovalidate.New()
	if err != nil {
		t.Fatalf("protovalidate.New() error = %v", err)
	}

	interceptor := NewValidationInterceptor(validator)
	nextCalled := false

	unary := interceptor.WrapUnary(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		nextCalled = true
		return connect.NewResponse(&lessionv1.CreateSeriesResponse{}), nil
	})

	req := connect.NewRequest(&lessionv1.CreateSeriesRequest{
		Series: &lessionv1.SeriesDraft{Title: "Missing slug"},
	})

	if _, err := unary(context.Background(), req); err == nil {
		t.Fatal("expected validation error for invalid request")
	} else if !errors.Is(err, core.ErrValidation) {
		t.Fatalf("expected error to wrap core.ErrValidation, got %v", err)
	}
	if nextCalled {
		t.Fatal("expected interceptor to block invalid request before calling next")
	}
}

func TestValidationInterceptor_AllowsWhenValidatorNil(t *testing.T) {
	interceptor := NewValidationInterceptor(nil)
	nextCalled := false

	unary := interceptor.WrapUnary(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		nextCalled = true
		return connect.NewResponse(&lessionv1.CreateSeriesResponse{}), nil
	})

	req := connect.NewRequest(&lessionv1.CreateSeriesRequest{
		Series: &lessionv1.SeriesDraft{},
	})

	if _, err := unary(context.Background(), req); err != nil {
		t.Fatalf("unary() error = %v", err)
	}
	if !nextCalled {
		t.Fatal("expected next to be called when validator is nil")
	}
}
