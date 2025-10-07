package fake

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/eslsoft/lession/internal/core"
)

// Provider offers a simplified upload provider that simulates storage behaviour.
type Provider struct {
	uploadBase   string
	playbackBase string
	expiry       time.Duration
	now          func() time.Time
}

// NewProvider constructs a fake upload provider.
func NewProvider(uploadBase, playbackBase string, expiry time.Duration) *Provider {
	if expiry <= 0 {
		expiry = 15 * time.Minute
	}
	return &Provider{
		uploadBase:   uploadBase,
		playbackBase: playbackBase,
		expiry:       expiry,
		now:          time.Now,
	}
}

// WithClock overrides the clock used for generating timestamps.
func (p *Provider) WithClock(fn func() time.Time) {
	if fn != nil {
		p.now = fn
	}
}

var _ core.UploadProvider = (*Provider)(nil)

// CreateUpload simulates issuing a pre-signed upload target.
func (p *Provider) CreateUpload(ctx context.Context, params core.ProviderCreateUploadParams) (*core.ProviderCreateUploadResult, error) {
	_ = ctx // unused in fake implementation

	assetKey := uuid.New().String()
	uploadURL := fmt.Sprintf("%s/%s", normalizeBase(p.uploadBase, "https://fake-upload.example.com"), assetKey)

	return &core.ProviderCreateUploadResult{
		AssetKey: assetKey,
		Protocol: core.UploadProtocolPresignedPut,
		Target: core.UploadTarget{
			Method: "PUT",
			URL:    uploadURL,
			Headers: map[string]string{
				"X-Fake-Provider": "true",
				"Content-Type":    params.MimeType,
			},
		},
		ExpiresAt:       p.now().Add(p.expiry).UTC(),
		EstimatedStatus: core.AssetStatusPending,
	}, nil
}

// CompleteUpload generates a playback URL keyed by the asset.
func (p *Provider) CompleteUpload(ctx context.Context, params core.ProviderCompleteUploadParams) (*core.ProviderCompleteUploadResult, error) {
	_ = ctx

	playback := fmt.Sprintf("%s/%s/master.m3u8", normalizeBase(p.playbackBase, "https://fake-playback.example.com"), params.AssetKey)
	// naive duration estimation: 1 minute per 5 MB
	minutes := params.ContentLength / (5 * 1024 * 1024)
	if minutes == 0 {
		minutes = 1
	}

	return &core.ProviderCompleteUploadResult{
		PlaybackURL: playback,
		Duration:    time.Duration(minutes) * time.Minute,
	}, nil
}

func normalizeBase(base, fallback string) string {
	if base == "" {
		return fallback
	}
	return strings.TrimSuffix(base, "/")
}
