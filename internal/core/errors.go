package core

import "errors"

var (
	// ErrNotFound indicates the requested resource does not exist.
	ErrNotFound = errors.New("not found")
	// ErrInvalidPageToken indicates pagination tokens are malformed.
	ErrInvalidPageToken = errors.New("invalid page token")
	// ErrValidation represents user input validation failures.
	ErrValidation = errors.New("validation error")
	// ErrUploadIdentifierRequired indicates neither upload ID nor asset key were supplied.
	ErrUploadIdentifierRequired = errors.New("upload identifier required")
	// ErrUploadInvalidState indicates an upload cannot transition from its current status.
	ErrUploadInvalidState = errors.New("upload session is in an invalid state")
)
