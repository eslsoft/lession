package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/eslsoft/lession/internal/core"
)

// AssetService coordinates asset-related use cases, delegating vendor specifics
// to a pluggable upload provider and persistence to the repository.
type AssetService struct {
	repo     core.AssetRepository
	provider core.UploadProvider
	now      func() time.Time
}

// NewAssetService constructs an asset service using the supplied repository and provider.
func NewAssetService(repo core.AssetRepository, provider core.UploadProvider) *AssetService {
	return &AssetService{
		repo:     repo,
		provider: provider,
		now:      time.Now,
	}
}

// WithClock allows tests to override the clock used by the service.
func (s *AssetService) WithClock(fn func() time.Time) {
	if fn != nil {
		s.now = fn
	}
}

var _ core.AssetService = (*AssetService)(nil)

// CreateUpload starts a new upload session by coordinating with the provider and persisting state.
func (s *AssetService) CreateUpload(ctx context.Context, params core.CreateUploadParams) (*core.CreateUploadResult, error) {
	if err := validateCreateUploadParams(params); err != nil {
		return nil, err
	}

	providerRes, err := s.provider.CreateUpload(ctx, core.ProviderCreateUploadParams{
		Type:             params.Type,
		OriginalFilename: params.OriginalFilename,
		MimeType:         params.MimeType,
		ContentLength:    params.ContentLength,
	})
	if err != nil {
		return nil, err
	}

	now := s.now().UTC()

	session := core.UploadSession{
		ID:               uuid.New(),
		AssetKey:         providerRes.AssetKey,
		Type:             params.Type,
		Protocol:         providerRes.Protocol,
		Status:           core.UploadStatusAwaitingUpload,
		Target:           providerRes.Target,
		OriginalFilename: params.OriginalFilename,
		MimeType:         params.MimeType,
		ContentLength:    params.ContentLength,
		ExpiresAt:        providerRes.ExpiresAt,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	assetStatus := providerRes.EstimatedStatus
	if assetStatus == core.AssetStatusUnspecified {
		assetStatus = core.AssetStatusPending
	}

	asset := core.Asset{
		ID:               uuid.New(),
		AssetKey:         providerRes.AssetKey,
		Type:             params.Type,
		Status:           assetStatus,
		OriginalFilename: params.OriginalFilename,
		MimeType:         params.MimeType,
		Filesize:         params.ContentLength,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.repo.CreateUploadSession(ctx, session); err != nil {
		return nil, err
	}
	if err := s.repo.CreateAsset(ctx, asset); err != nil {
		return nil, err
	}

	return &core.CreateUploadResult{
		Session: session,
		Asset:   asset,
	}, nil
}

// GetUploadSession fetches an upload session by either ID or asset key.
func (s *AssetService) GetUploadSession(ctx context.Context, id core.UploadIdentifier) (*core.UploadSession, error) {
	session, err := s.lookupUploadSession(ctx, id)
	if err != nil {
		return nil, err
	}
	return session, nil
}

// CompleteUpload finalises an upload, requesting the provider to produce playback details.
func (s *AssetService) CompleteUpload(ctx context.Context, params core.CompleteUploadParams) (*core.CompleteUploadResult, error) {
	if params.ContentLength < 0 {
		return nil, fmt.Errorf("%w: content length must be non-negative", core.ErrValidation)
	}

	session, err := s.lookupUploadSession(ctx, params.Identifier)
	if err != nil {
		return nil, err
	}

	switch session.Status {
	case core.UploadStatusAwaitingUpload, core.UploadStatusUploading:
		// allowed transitions
	case core.UploadStatusCompleted:
		return nil, core.ErrUploadInvalidState
	default:
		return nil, core.ErrUploadInvalidState
	}

	providerRes, err := s.provider.CompleteUpload(ctx, core.ProviderCompleteUploadParams{
		AssetKey:      session.AssetKey,
		Checksum:      params.Checksum,
		ContentLength: params.ContentLength,
	})
	if err != nil {
		return nil, err
	}

	now := s.now().UTC()
	session.Status = core.UploadStatusCompleted
	session.UpdatedAt = now

	if err := s.repo.UpdateUploadSession(ctx, *session); err != nil {
		return nil, err
	}

	asset, err := s.repo.GetAssetByKey(ctx, session.AssetKey)
	if err != nil {
		return nil, err
	}

	asset.Status = core.AssetStatusReady
	asset.PlaybackURL = providerRes.PlaybackURL
	asset.Duration = providerRes.Duration
	asset.Filesize = params.ContentLength
	asset.UpdatedAt = now
	asset.ReadyAt = &now

	if err := s.repo.UpdateAsset(ctx, *asset); err != nil {
		return nil, err
	}

	return &core.CompleteUploadResult{
		Asset:   *asset,
		Session: *session,
	}, nil
}

// GetAsset retrieves an asset by its identifier.
func (s *AssetService) GetAsset(ctx context.Context, id uuid.UUID) (*core.Asset, error) {
	return s.repo.GetAssetByID(ctx, id)
}

// GetAssetByKey retrieves an asset via its asset key.
func (s *AssetService) GetAssetByKey(ctx context.Context, assetKey string) (*core.Asset, error) {
	if assetKey == "" {
		return nil, fmt.Errorf("%w: asset key required", core.ErrValidation)
	}
	return s.repo.GetAssetByKey(ctx, assetKey)
}

// ListAssets returns a paginated collection of assets from the repository.
func (s *AssetService) ListAssets(ctx context.Context, filter core.AssetListFilter) ([]core.Asset, string, error) {
	if filter.PageSize < 0 {
		return nil, "", fmt.Errorf("%w: page size must be non-negative", core.ErrValidation)
	}
	return s.repo.ListAssets(ctx, filter)
}

// UpdateAsset mutates the provided asset record.
func (s *AssetService) UpdateAsset(ctx context.Context, asset core.Asset) (*core.Asset, error) {
	if asset.ID == uuid.Nil {
		return nil, fmt.Errorf("%w: asset id required", core.ErrValidation)
	}
	asset.UpdatedAt = s.now().UTC()
	if err := s.repo.UpdateAsset(ctx, asset); err != nil {
		return nil, err
	}
	return &asset, nil
}

// DeleteAsset removes (or hard deletes) an asset.
func (s *AssetService) DeleteAsset(ctx context.Context, id uuid.UUID, hardDelete bool) (*core.Asset, error) {
	if id == uuid.Nil {
		return nil, fmt.Errorf("%w: asset id required", core.ErrValidation)
	}
	return s.repo.DeleteAsset(ctx, id, hardDelete)
}

func (s *AssetService) lookupUploadSession(ctx context.Context, id core.UploadIdentifier) (*core.UploadSession, error) {
	if id.UploadID == uuid.Nil && id.AssetKey == "" {
		return nil, core.ErrUploadIdentifierRequired
	}

	if id.UploadID != uuid.Nil {
		if session, err := s.repo.GetUploadSessionByID(ctx, id.UploadID); err == nil {
			return session, nil
		} else if !isNotFound(err) {
			return nil, err
		}
	}

	if id.AssetKey != "" {
		return s.repo.GetUploadSessionByAssetKey(ctx, id.AssetKey)
	}

	return nil, core.ErrNotFound
}

func validateCreateUploadParams(params core.CreateUploadParams) error {
	if params.Type == core.AssetTypeUnspecified {
		return fmt.Errorf("%w: asset type required", core.ErrValidation)
	}
	if params.OriginalFilename == "" {
		return fmt.Errorf("%w: original filename required", core.ErrValidation)
	}
	if params.MimeType == "" {
		return fmt.Errorf("%w: mime type required", core.ErrValidation)
	}
	if params.ContentLength < 0 {
		return fmt.Errorf("%w: content length must be non-negative", core.ErrValidation)
	}
	return nil
}

func isNotFound(err error) bool {
	return errors.Is(err, core.ErrNotFound)
}
