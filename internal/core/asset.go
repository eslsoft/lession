package core

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// AssetType represents the media type for an asset.
type AssetType int

const (
	AssetTypeUnspecified AssetType = iota
	AssetTypeVideo
	AssetTypeAudio
)

// AssetStatus represents the lifecycle state of an asset.
type AssetStatus int

const (
	AssetStatusUnspecified AssetStatus = iota
	AssetStatusPending
	AssetStatusProcessing
	AssetStatusReady
	AssetStatusFailed
	AssetStatusDeleted
)

// UploadProtocol defines the upload mechanism used by a provider.
type UploadProtocol int

const (
	UploadProtocolUnspecified UploadProtocol = iota
	UploadProtocolPresignedPut
	UploadProtocolPresignedPost
	UploadProtocolMultipart
	UploadProtocolTus
)

// UploadStatus represents the lifecycle of an upload session.
type UploadStatus int

const (
	UploadStatusUnspecified UploadStatus = iota
	UploadStatusAwaitingUpload
	UploadStatusUploading
	UploadStatusCompleted
	UploadStatusExpired
	UploadStatusFailed
)

// UploadTarget contains the instructions required for a client-side upload.
type UploadTarget struct {
	Method     string
	URL        string
	Headers    map[string]string
	FormFields map[string]string
}

// Asset captures the persisted media information stored by the platform.
type Asset struct {
	ID               uuid.UUID
	AssetKey         string
	Type             AssetType
	Status           AssetStatus
	OriginalFilename string
	MimeType         string
	Filesize         int64
	Duration         time.Duration
	PlaybackURL      string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	ReadyAt          *time.Time
}

// UploadSession represents a single upload flow managed by the platform.
type UploadSession struct {
	ID               uuid.UUID
	AssetKey         string
	Type             AssetType
	Protocol         UploadProtocol
	Status           UploadStatus
	Target           UploadTarget
	OriginalFilename string
	MimeType         string
	ContentLength    int64
	ExpiresAt        time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// CreateUploadParams describes the user-facing inputs when requesting an upload session.
type CreateUploadParams struct {
	Type             AssetType
	OriginalFilename string
	MimeType         string
	ContentLength    int64
}

// CreateUploadResult bundles the created upload session and corresponding asset.
type CreateUploadResult struct {
	Session UploadSession
	Asset   Asset
}

// CompleteUploadParams contains data required to finalize an upload session.
type CompleteUploadParams struct {
	Identifier    UploadIdentifier
	Checksum      string
	ContentLength int64
}

// UploadIdentifier provides flexible addressing for uploads.
type UploadIdentifier struct {
	UploadID uuid.UUID
	AssetKey string
}

// CompleteUploadResult returns the asset state after a successful completion.
type CompleteUploadResult struct {
	Asset   Asset
	Session UploadSession
}

// AssetListFilter describes pagination and filtering options.
type AssetListFilter struct {
	PageSize  int
	PageToken string
	Statuses  []AssetStatus
	Types     []AssetType
	AssetKeys []string
}

// AssetRepository defines the persistence contract for assets and upload sessions.
type AssetRepository interface {
	CreateUploadSession(ctx context.Context, session UploadSession) error
	UpdateUploadSession(ctx context.Context, session UploadSession) error
	GetUploadSessionByID(ctx context.Context, id uuid.UUID) (*UploadSession, error)
	GetUploadSessionByAssetKey(ctx context.Context, assetKey string) (*UploadSession, error)

	CreateAsset(ctx context.Context, asset Asset) error
	UpdateAsset(ctx context.Context, asset Asset) error
	GetAssetByID(ctx context.Context, id uuid.UUID) (*Asset, error)
	GetAssetByKey(ctx context.Context, assetKey string) (*Asset, error)
	ListAssets(ctx context.Context, filter AssetListFilter) ([]Asset, string, error)
	DeleteAsset(ctx context.Context, id uuid.UUID, hardDelete bool) (*Asset, error)
}

// UploadProvider defines the contract for vendor-specific upload orchestration.
type UploadProvider interface {
	CreateUpload(ctx context.Context, params ProviderCreateUploadParams) (*ProviderCreateUploadResult, error)
	CompleteUpload(ctx context.Context, params ProviderCompleteUploadParams) (*ProviderCompleteUploadResult, error)
}

// ProviderCreateUploadParams bundles the data required by upload providers.
type ProviderCreateUploadParams struct {
	Type             AssetType
	OriginalFilename string
	MimeType         string
	ContentLength    int64
}

// ProviderCreateUploadResult contains provider-issued instructions.
type ProviderCreateUploadResult struct {
	AssetKey        string
	Protocol        UploadProtocol
	Target          UploadTarget
	ExpiresAt       time.Time
	EstimatedStatus AssetStatus
}

// ProviderCompleteUploadParams contains details when an upload completes.
type ProviderCompleteUploadParams struct {
	AssetKey      string
	Checksum      string
	ContentLength int64
}

// ProviderCompleteUploadResult conveys the playback details produced by the provider.
type ProviderCompleteUploadResult struct {
	PlaybackURL string
	Duration    time.Duration
}

// AssetService exposes the asset use cases to upper layers.
type AssetService interface {
	CreateUpload(ctx context.Context, params CreateUploadParams) (*CreateUploadResult, error)
	GetUploadSession(ctx context.Context, id UploadIdentifier) (*UploadSession, error)
	CompleteUpload(ctx context.Context, params CompleteUploadParams) (*CompleteUploadResult, error)
	GetAsset(ctx context.Context, id uuid.UUID) (*Asset, error)
	GetAssetByKey(ctx context.Context, assetKey string) (*Asset, error)
	ListAssets(ctx context.Context, filter AssetListFilter) ([]Asset, string, error)
	UpdateAsset(ctx context.Context, asset Asset) (*Asset, error)
	DeleteAsset(ctx context.Context, id uuid.UUID, hardDelete bool) (*Asset, error)
}
