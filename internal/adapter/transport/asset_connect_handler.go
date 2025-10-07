package transport

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	durationpb "google.golang.org/protobuf/types/known/durationpb"
	fieldmaskpb "google.golang.org/protobuf/types/known/fieldmaskpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"

	"github.com/eslsoft/lession/internal/core"
	lessionv1 "github.com/eslsoft/lession/pkg/api/lession/v1"
	"github.com/eslsoft/lession/pkg/api/lession/v1/lessionv1connect"
)

// AssetHandler implements the generated Connect service for asset operations.
type AssetHandler struct {
	service core.AssetService
}

// NewAssetHandler constructs a new Asset handler backed by the provided service.
func NewAssetHandler(service core.AssetService) *AssetHandler {
	return &AssetHandler{service: service}
}

var _ lessionv1connect.AssetServiceHandler = (*AssetHandler)(nil)

// CreateUpload establishes a new upload session and returns client instructions.
func (h *AssetHandler) CreateUpload(ctx context.Context, req *connect.Request[lessionv1.CreateUploadRequest]) (*connect.Response[lessionv1.CreateUploadResponse], error) {
	params := core.CreateUploadParams{
		Type:             fromProtoMediaType(req.Msg.GetType()),
		OriginalFilename: req.Msg.GetOriginalFilename(),
		MimeType:         req.Msg.GetMimeType(),
		ContentLength:    req.Msg.GetContentLength(),
	}

	result, err := h.service.CreateUpload(ctx, params)
	if err != nil {
		return nil, err
	}

	res := connect.NewResponse(&lessionv1.CreateUploadResponse{
		Upload: toProtoUploadSession(&result.Session),
	})
	return res, nil
}

// GetUpload retrieves details for an existing upload session.
func (h *AssetHandler) GetUpload(ctx context.Context, req *connect.Request[lessionv1.GetUploadRequest]) (*connect.Response[lessionv1.GetUploadResponse], error) {
	identifier, err := buildUploadIdentifier(req.Msg.GetUploadId(), req.Msg.GetAssetKey())
	if err != nil {
		return nil, err
	}

	session, err := h.service.GetUploadSession(ctx, identifier)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.GetUploadResponse{
		Upload: toProtoUploadSession(session),
	}), nil
}

// CompleteUpload finalizes an upload session and transitions the asset to processing.
func (h *AssetHandler) CompleteUpload(ctx context.Context, req *connect.Request[lessionv1.CompleteUploadRequest]) (*connect.Response[lessionv1.CompleteUploadResponse], error) {
	identifier, err := buildUploadIdentifier(req.Msg.GetUploadId(), req.Msg.GetAssetKey())
	if err != nil {
		return nil, err
	}

	result, err := h.service.CompleteUpload(ctx, core.CompleteUploadParams{
		Identifier:    identifier,
		Checksum:      req.Msg.GetChecksum(),
		ContentLength: req.Msg.GetContentLength(),
	})
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.CompleteUploadResponse{
		Asset:  toProtoAsset(&result.Asset),
		Upload: toProtoUploadSession(&result.Session),
	}), nil
}

// GetAsset returns details for a single managed asset.
func (h *AssetHandler) GetAsset(ctx context.Context, req *connect.Request[lessionv1.GetAssetRequest]) (*connect.Response[lessionv1.GetAssetResponse], error) {
	identifier := req.Msg.GetIdentifier()
	switch id := identifier.(type) {
	case *lessionv1.GetAssetRequest_AssetId:
		assetID, err := uuid.Parse(id.AssetId)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid asset_id %q", core.ErrValidation, id.AssetId)
		}
		asset, err := h.service.GetAsset(ctx, assetID)
		if err != nil {
			return nil, err
		}
		return connect.NewResponse(&lessionv1.GetAssetResponse{Asset: toProtoAsset(asset)}), nil
	case *lessionv1.GetAssetRequest_AssetKey:
		if id.AssetKey == "" {
			return nil, fmt.Errorf("%w: asset key required", core.ErrValidation)
		}
		asset, err := h.service.GetAssetByKey(ctx, id.AssetKey)
		if err != nil {
			return nil, err
		}
		return connect.NewResponse(&lessionv1.GetAssetResponse{Asset: toProtoAsset(asset)}), nil
	default:
		return nil, fmt.Errorf("%w: asset identifier required", core.ErrValidation)
	}
}

// ListAssets returns a filtered, paginated collection of assets.
func (h *AssetHandler) ListAssets(ctx context.Context, req *connect.Request[lessionv1.ListAssetsRequest]) (*connect.Response[lessionv1.ListAssetsResponse], error) {
	filter := core.AssetListFilter{
		PageSize:  int(req.Msg.GetPageSize()),
		PageToken: req.Msg.GetPageToken(),
		Statuses:  fromProtoAssetStatuses(req.Msg.GetStatuses()),
		Types:     fromProtoMediaTypes(req.Msg.GetTypes()),
		AssetKeys: req.Msg.GetAssetKeys(),
	}

	assets, nextToken, err := h.service.ListAssets(ctx, filter)
	if err != nil {
		return nil, err
	}

	protoAssets := make([]*lessionv1.Asset, 0, len(assets))
	for i := range assets {
		protoAssets = append(protoAssets, toProtoAsset(&assets[i]))
	}

	return connect.NewResponse(&lessionv1.ListAssetsResponse{
		Assets:        protoAssets,
		NextPageToken: nextToken,
	}), nil
}

// UpdateAsset applies partial updates to an asset (e.g., change metadata).
func (h *AssetHandler) UpdateAsset(ctx context.Context, req *connect.Request[lessionv1.UpdateAssetRequest]) (*connect.Response[lessionv1.UpdateAssetResponse], error) {
	if req.Msg.GetAsset() == nil {
		return nil, fmt.Errorf("%w: asset payload required", core.ErrValidation)
	}

	id, err := uuid.Parse(req.Msg.GetAsset().GetId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid asset_id %q", core.ErrValidation, req.Msg.GetAsset().GetId())
	}

	var current *core.Asset
	mask := req.Msg.GetUpdateMask()
	if isFieldMaskEmpty(mask) {
		asset := fromProtoAsset(req.Msg.GetAsset())
		asset.ID = id
		updated, err := h.service.UpdateAsset(ctx, *asset)
		if err != nil {
			return nil, err
		}
		return connect.NewResponse(&lessionv1.UpdateAssetResponse{Asset: toProtoAsset(updated)}), nil
	}

	current, err = h.service.GetAsset(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := applyAssetFieldMask(current, req.Msg.GetAsset(), mask); err != nil {
		return nil, err
	}

	updated, err := h.service.UpdateAsset(ctx, *current)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.UpdateAssetResponse{
		Asset: toProtoAsset(updated),
	}), nil
}

// DeleteAsset archives or permanently deletes an asset.
func (h *AssetHandler) DeleteAsset(ctx context.Context, req *connect.Request[lessionv1.DeleteAssetRequest]) (*connect.Response[lessionv1.DeleteAssetResponse], error) {
	id, err := uuid.Parse(req.Msg.GetAssetId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid asset_id %q", core.ErrValidation, req.Msg.GetAssetId())
	}

	asset, err := h.service.DeleteAsset(ctx, id, req.Msg.GetHardDelete())
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.DeleteAssetResponse{
		Asset: toProtoAsset(asset),
	}), nil
}

func buildUploadIdentifier(uploadID, assetKey string) (core.UploadIdentifier, error) {
	var identifier core.UploadIdentifier
	if trimmed := strings.TrimSpace(uploadID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			return core.UploadIdentifier{}, fmt.Errorf("%w: invalid upload_id %q", core.ErrValidation, trimmed)
		}
		identifier.UploadID = parsed
	}
	identifier.AssetKey = strings.TrimSpace(assetKey)
	if identifier.UploadID == uuid.Nil && identifier.AssetKey == "" {
		return core.UploadIdentifier{}, core.ErrUploadIdentifierRequired
	}
	return identifier, nil
}

func fromProtoMediaType(t lessionv1.MediaType) core.AssetType {
	switch t {
	case lessionv1.MediaType_MEDIA_TYPE_AUDIO:
		return core.AssetTypeAudio
	case lessionv1.MediaType_MEDIA_TYPE_VIDEO:
		return core.AssetTypeVideo
	default:
		return core.AssetTypeUnspecified
	}
}

func fromProtoMediaTypes(types []lessionv1.MediaType) []core.AssetType {
	if len(types) == 0 {
		return nil
	}
	result := make([]core.AssetType, 0, len(types))
	for _, t := range types {
		result = append(result, fromProtoMediaType(t))
	}
	return result
}

func fromProtoAssetStatus(status lessionv1.AssetStatus) core.AssetStatus {
	switch status {
	case lessionv1.AssetStatus_ASSET_STATUS_PENDING:
		return core.AssetStatusPending
	case lessionv1.AssetStatus_ASSET_STATUS_PROCESSING:
		return core.AssetStatusProcessing
	case lessionv1.AssetStatus_ASSET_STATUS_READY:
		return core.AssetStatusReady
	case lessionv1.AssetStatus_ASSET_STATUS_FAILED:
		return core.AssetStatusFailed
	case lessionv1.AssetStatus_ASSET_STATUS_DELETED:
		return core.AssetStatusDeleted
	default:
		return core.AssetStatusUnspecified
	}
}

func fromProtoAssetStatuses(statuses []lessionv1.AssetStatus) []core.AssetStatus {
	if len(statuses) == 0 {
		return nil
	}
	result := make([]core.AssetStatus, 0, len(statuses))
	for _, status := range statuses {
		result = append(result, fromProtoAssetStatus(status))
	}
	return result
}

func toProtoUploadSession(session *core.UploadSession) *lessionv1.UploadSession {
	if session == nil {
		return nil
	}
	return &lessionv1.UploadSession{
		Id:               session.ID.String(),
		AssetKey:         session.AssetKey,
		Type:             toProtoMediaType(session.Type),
		Protocol:         toProtoUploadProtocol(session.Protocol),
		Status:           toProtoUploadStatus(session.Status),
		Target:           toProtoUploadTarget(session.Target),
		OriginalFilename: session.OriginalFilename,
		MimeType:         session.MimeType,
		ContentLength:    session.ContentLength,
		ExpiresAt:        timestamppb.New(session.ExpiresAt),
		CreatedAt:        timestamppb.New(session.CreatedAt),
		UpdatedAt:        timestamppb.New(session.UpdatedAt),
	}
}

func toProtoUploadTarget(target core.UploadTarget) *lessionv1.UploadTarget {
	return &lessionv1.UploadTarget{
		Method:     target.Method,
		Url:        target.URL,
		Headers:    target.Headers,
		FormFields: target.FormFields,
	}
}

func toProtoAsset(asset *core.Asset) *lessionv1.Asset {
	if asset == nil {
		return nil
	}
	proto := &lessionv1.Asset{
		Id:               asset.ID.String(),
		AssetKey:         asset.AssetKey,
		Type:             toProtoMediaType(asset.Type),
		Status:           toProtoAssetStatus(asset.Status),
		OriginalFilename: asset.OriginalFilename,
		MimeType:         asset.MimeType,
		Filesize:         asset.Filesize,
		PlaybackUrl:      asset.PlaybackURL,
		CreatedAt:        timestamppb.New(asset.CreatedAt),
		UpdatedAt:        timestamppb.New(asset.UpdatedAt),
	}
	if asset.Duration > 0 {
		proto.Duration = durationpb.New(asset.Duration)
	}
	if asset.ReadyAt != nil {
		proto.ReadyAt = timestamppb.New(*asset.ReadyAt)
	}
	return proto
}

func toProtoMediaType(t core.AssetType) lessionv1.MediaType {
	switch t {
	case core.AssetTypeAudio:
		return lessionv1.MediaType_MEDIA_TYPE_AUDIO
	case core.AssetTypeVideo:
		return lessionv1.MediaType_MEDIA_TYPE_VIDEO
	default:
		return lessionv1.MediaType_MEDIA_TYPE_UNSPECIFIED
	}
}

func toProtoAssetStatus(status core.AssetStatus) lessionv1.AssetStatus {
	switch status {
	case core.AssetStatusPending:
		return lessionv1.AssetStatus_ASSET_STATUS_PENDING
	case core.AssetStatusProcessing:
		return lessionv1.AssetStatus_ASSET_STATUS_PROCESSING
	case core.AssetStatusReady:
		return lessionv1.AssetStatus_ASSET_STATUS_READY
	case core.AssetStatusFailed:
		return lessionv1.AssetStatus_ASSET_STATUS_FAILED
	case core.AssetStatusDeleted:
		return lessionv1.AssetStatus_ASSET_STATUS_DELETED
	default:
		return lessionv1.AssetStatus_ASSET_STATUS_UNSPECIFIED
	}
}

func toProtoUploadProtocol(protocol core.UploadProtocol) lessionv1.UploadProtocol {
	switch protocol {
	case core.UploadProtocolPresignedPut:
		return lessionv1.UploadProtocol_UPLOAD_PROTOCOL_PRESIGNED_PUT
	case core.UploadProtocolPresignedPost:
		return lessionv1.UploadProtocol_UPLOAD_PROTOCOL_PRESIGNED_POST
	case core.UploadProtocolMultipart:
		return lessionv1.UploadProtocol_UPLOAD_PROTOCOL_MULTIPART
	default:
		return lessionv1.UploadProtocol_UPLOAD_PROTOCOL_UNSPECIFIED
	}
}

func toProtoUploadStatus(status core.UploadStatus) lessionv1.UploadStatus {
	switch status {
	case core.UploadStatusAwaitingUpload:
		return lessionv1.UploadStatus_UPLOAD_STATUS_AWAITING_UPLOAD
	case core.UploadStatusUploading:
		return lessionv1.UploadStatus_UPLOAD_STATUS_UPLOADING
	case core.UploadStatusCompleted:
		return lessionv1.UploadStatus_UPLOAD_STATUS_COMPLETED
	case core.UploadStatusExpired:
		return lessionv1.UploadStatus_UPLOAD_STATUS_EXPIRED
	case core.UploadStatusFailed:
		return lessionv1.UploadStatus_UPLOAD_STATUS_FAILED
	default:
		return lessionv1.UploadStatus_UPLOAD_STATUS_UNSPECIFIED
	}
}

func fromProtoAsset(msg *lessionv1.Asset) *core.Asset {
	if msg == nil {
		return nil
	}
	id, _ := uuid.Parse(msg.GetId())
	asset := &core.Asset{
		ID:               id,
		AssetKey:         msg.GetAssetKey(),
		Type:             fromProtoMediaType(msg.GetType()),
		Status:           fromProtoAssetStatus(msg.GetStatus()),
		OriginalFilename: msg.GetOriginalFilename(),
		MimeType:         msg.GetMimeType(),
		Filesize:         msg.GetFilesize(),
		PlaybackURL:      msg.GetPlaybackUrl(),
	}
	if msg.GetDuration() != nil {
		asset.Duration = msg.GetDuration().AsDuration()
	}
	if msg.GetCreatedAt() != nil {
		asset.CreatedAt = msg.GetCreatedAt().AsTime()
	}
	if msg.GetUpdatedAt() != nil {
		asset.UpdatedAt = msg.GetUpdatedAt().AsTime()
	}
	if msg.GetReadyAt() != nil {
		t := msg.GetReadyAt().AsTime()
		asset.ReadyAt = &t
	}
	return asset
}

func applyAssetFieldMask(target *core.Asset, patch *lessionv1.Asset, mask *fieldmaskpb.FieldMask) error {
	for _, path := range mask.Paths {
		switch strings.ToLower(path) {
		case "status":
			target.Status = fromProtoAssetStatus(patch.GetStatus())
		case "playback_url":
			target.PlaybackURL = patch.GetPlaybackUrl()
		case "mime_type":
			target.MimeType = patch.GetMimeType()
		case "filesize":
			target.Filesize = patch.GetFilesize()
		case "original_filename":
			target.OriginalFilename = patch.GetOriginalFilename()
		case "duration":
			if patch.GetDuration() != nil {
				target.Duration = patch.GetDuration().AsDuration()
			} else {
				target.Duration = 0
			}
		default:
			return fmt.Errorf("%w: unsupported update path %q", core.ErrValidation, path)
		}
	}
	return nil
}

func isFieldMaskEmpty(mask *fieldmaskpb.FieldMask) bool {
	return mask == nil || len(mask.Paths) == 0
}
