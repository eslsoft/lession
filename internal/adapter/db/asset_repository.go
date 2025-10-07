package db

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	entasset "github.com/eslsoft/lession/internal/adapter/db/ent/generated/asset"
	entupload "github.com/eslsoft/lession/internal/adapter/db/ent/generated/uploadsession"
	"github.com/eslsoft/lession/internal/core"
)

// AssetRepository persists assets and upload sessions using Ent.
type AssetRepository struct {
	client *entgenerated.Client
}

// NewAssetRepository constructs an Ent-backed asset repository.
func NewAssetRepository(client *entgenerated.Client) *AssetRepository {
	return &AssetRepository{client: client}
}

var _ core.AssetRepository = (*AssetRepository)(nil)

// CreateUploadSession stores an upload session record.
func (r *AssetRepository) CreateUploadSession(ctx context.Context, session core.UploadSession) error {
	builder := r.client.UploadSession.Create().
		SetID(session.ID).
		SetAssetKey(session.AssetKey).
		SetType(int(session.Type)).
		SetProtocol(int(session.Protocol)).
		SetStatus(int(session.Status)).
		SetTargetMethod(session.Target.Method).
		SetTargetURL(session.Target.URL).
		SetTargetHeaders(session.Target.Headers).
		SetTargetFormFields(session.Target.FormFields).
		SetOriginalFilename(session.OriginalFilename).
		SetMimeType(session.MimeType).
		SetContentLength(session.ContentLength).
		SetExpiresAt(session.ExpiresAt).
		SetCreatedAt(session.CreatedAt).
		SetUpdatedAt(session.UpdatedAt)

	_, err := builder.Save(ctx)
	return err
}

// UpdateUploadSession updates a persisted upload session.
func (r *AssetRepository) UpdateUploadSession(ctx context.Context, session core.UploadSession) error {
	builder := r.client.UploadSession.UpdateOneID(session.ID).
		SetStatus(int(session.Status)).
		SetTargetMethod(session.Target.Method).
		SetTargetURL(session.Target.URL).
		SetTargetHeaders(session.Target.Headers).
		SetTargetFormFields(session.Target.FormFields).
		SetOriginalFilename(session.OriginalFilename).
		SetMimeType(session.MimeType).
		SetContentLength(session.ContentLength).
		SetExpiresAt(session.ExpiresAt).
		SetUpdatedAt(session.UpdatedAt)

	_, err := builder.Save(ctx)
	if entgenerated.IsNotFound(err) {
		return core.ErrNotFound
	}
	return err
}

// GetUploadSessionByID fetches a session by its identifier.
func (r *AssetRepository) GetUploadSessionByID(ctx context.Context, id uuid.UUID) (*core.UploadSession, error) {
	row, err := r.client.UploadSession.Get(ctx, id)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainUploadSession(row), nil
}

// GetUploadSessionByAssetKey fetches a session via asset key.
func (r *AssetRepository) GetUploadSessionByAssetKey(ctx context.Context, assetKey string) (*core.UploadSession, error) {
	row, err := r.client.UploadSession.Query().
		Where(entupload.AssetKey(assetKey)).
		Only(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainUploadSession(row), nil
}

// CreateAsset persists a new asset record.
func (r *AssetRepository) CreateAsset(ctx context.Context, asset core.Asset) error {
	builder := r.client.Asset.Create().
		SetID(asset.ID).
		SetAssetKey(asset.AssetKey).
		SetType(int(asset.Type)).
		SetStatus(int(asset.Status)).
		SetOriginalFilename(asset.OriginalFilename).
		SetMimeType(asset.MimeType).
		SetFilesize(asset.Filesize).
		SetDurationSeconds(int(asset.Duration / time.Second)).
		SetCreatedAt(asset.CreatedAt).
		SetUpdatedAt(asset.UpdatedAt)

	if asset.PlaybackURL != "" {
		builder.SetPlaybackURL(asset.PlaybackURL)
	}
	if asset.ReadyAt != nil {
		builder.SetReadyAt(*asset.ReadyAt)
	}

	_, err := builder.Save(ctx)
	return err
}

// UpdateAsset updates an existing asset record.
func (r *AssetRepository) UpdateAsset(ctx context.Context, asset core.Asset) error {
	builder := r.client.Asset.UpdateOneID(asset.ID).
		SetStatus(int(asset.Status)).
		SetOriginalFilename(asset.OriginalFilename).
		SetMimeType(asset.MimeType).
		SetFilesize(asset.Filesize).
		SetDurationSeconds(int(asset.Duration / time.Second)).
		SetUpdatedAt(asset.UpdatedAt)

	if asset.PlaybackURL != "" {
		builder.SetPlaybackURL(asset.PlaybackURL)
	} else {
		builder.SetPlaybackURL("")
	}

	if asset.ReadyAt != nil {
		builder.SetReadyAt(*asset.ReadyAt)
	} else {
		builder.ClearReadyAt()
	}

	_, err := builder.Save(ctx)
	if entgenerated.IsNotFound(err) {
		return core.ErrNotFound
	}
	return err
}

// GetAssetByID fetches an asset by id.
func (r *AssetRepository) GetAssetByID(ctx context.Context, id uuid.UUID) (*core.Asset, error) {
	row, err := r.client.Asset.Get(ctx, id)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainAsset(row), nil
}

// GetAssetByKey fetches an asset by asset key.
func (r *AssetRepository) GetAssetByKey(ctx context.Context, assetKey string) (*core.Asset, error) {
	row, err := r.client.Asset.Query().
		Where(entasset.AssetKey(assetKey)).
		Only(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainAsset(row), nil
}

// ListAssets retrieves assets matching the supplied filter.
func (r *AssetRepository) ListAssets(ctx context.Context, filter core.AssetListFilter) ([]core.Asset, string, error) {
	offset, err := parseOffset(filter.PageToken)
	if err != nil {
		return nil, "", err
	}

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	q := r.client.Asset.Query()

	if len(filter.Statuses) > 0 {
		statuses := make([]int, 0, len(filter.Statuses))
		for _, status := range filter.Statuses {
			statuses = append(statuses, int(status))
		}
		q = q.Where(entasset.StatusIn(statuses...))
	}

	if len(filter.Types) > 0 {
		types := make([]int, 0, len(filter.Types))
		for _, typ := range filter.Types {
			types = append(types, int(typ))
		}
		q = q.Where(entasset.TypeIn(types...))
	}

	if len(filter.AssetKeys) > 0 {
		q = q.Where(entasset.AssetKeyIn(filter.AssetKeys...))
	}

	rows, err := q.
		Order(entasset.ByCreatedAt(sql.OrderDesc())).
		Offset(offset).
		Limit(pageSize + 1).
		All(ctx)
	if err != nil {
		return nil, "", err
	}

	nextToken := ""
	if len(rows) > pageSize {
		rows = rows[:pageSize]
		nextToken = strconv.Itoa(offset + pageSize)
	}

	assets := make([]core.Asset, 0, len(rows))
	for _, row := range rows {
		assets = append(assets, *toDomainAsset(row))
	}

	return assets, nextToken, nil
}

// DeleteAsset deletes or archives an asset depending on the flag.
func (r *AssetRepository) DeleteAsset(ctx context.Context, id uuid.UUID, hardDelete bool) (*core.Asset, error) {
	if hardDelete {
		err := r.client.Asset.DeleteOneID(id).Exec(ctx)
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	now := time.Now().UTC()
	row, err := r.client.Asset.UpdateOneID(id).
		SetStatus(int(core.AssetStatusDeleted)).
		SetUpdatedAt(now).
		Save(ctx)
	if entgenerated.IsNotFound(err) {
		return nil, core.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	domain := toDomainAsset(row)
	return domain, nil
}

func toDomainAsset(row *entgenerated.Asset) *core.Asset {
	if row == nil {
		return nil
	}

	asset := &core.Asset{
		ID:               row.ID,
		AssetKey:         row.AssetKey,
		Type:             core.AssetType(row.Type),
		Status:           core.AssetStatus(row.Status),
		OriginalFilename: row.OriginalFilename,
		MimeType:         row.MimeType,
		Filesize:         row.Filesize,
		Duration:         time.Duration(row.DurationSeconds) * time.Second,
		PlaybackURL:      row.PlaybackURL,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}

	if row.ReadyAt != nil {
		t := *row.ReadyAt
		asset.ReadyAt = &t
	}

	return asset
}

func toDomainUploadSession(row *entgenerated.UploadSession) *core.UploadSession {
	if row == nil {
		return nil
	}

	return &core.UploadSession{
		ID:       row.ID,
		AssetKey: row.AssetKey,
		Type:     core.AssetType(row.Type),
		Protocol: core.UploadProtocol(row.Protocol),
		Status:   core.UploadStatus(row.Status),
		Target: core.UploadTarget{
			Method:     row.TargetMethod,
			URL:        row.TargetURL,
			Headers:    row.TargetHeaders,
			FormFields: row.TargetFormFields,
		},
		OriginalFilename: row.OriginalFilename,
		MimeType:         row.MimeType,
		ContentLength:    row.ContentLength,
		ExpiresAt:        row.ExpiresAt,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

func parseOffset(token string) (int, error) {
	if strings.TrimSpace(token) == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(token)
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("%w: %q", core.ErrInvalidPageToken, token)
	}
	return offset, nil
}
