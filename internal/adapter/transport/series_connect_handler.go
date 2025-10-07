package transport

import (
	"context"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/samber/lo"
	durationpb "google.golang.org/protobuf/types/known/durationpb"
	fieldmaskpb "google.golang.org/protobuf/types/known/fieldmaskpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"

	"github.com/eslsoft/lession/internal/core"
	lessionv1 "github.com/eslsoft/lession/pkg/api/lession/v1"
	"github.com/eslsoft/lession/pkg/api/lession/v1/lessionv1connect"
)

// SeriesHandler implements the generated Connect service for series operations.
type SeriesHandler struct {
	service core.SeriesService
}

// NewSeriesHandler constructs a Series handler backed by the provided service.
func NewSeriesHandler(service core.SeriesService) *SeriesHandler {
	return &SeriesHandler{service: service}
}

var _ lessionv1connect.SeriesServiceHandler = (*SeriesHandler)(nil)

// ListSeries returns a filtered, paginated collection of series.
func (h *SeriesHandler) ListSeries(ctx context.Context, req *connect.Request[lessionv1.ListSeriesRequest]) (*connect.Response[lessionv1.ListSeriesResponse], error) {
	statuses, err := fromProtoSeriesStatuses(req.Msg.GetStatuses())
	if err != nil {
		return nil, err
	}

	filter := core.SeriesListFilter{
		PageSize:        int(req.Msg.GetPageSize()),
		PageToken:       req.Msg.GetPageToken(),
		Statuses:        statuses,
		Language:        req.Msg.GetLanguage(),
		Level:           req.Msg.GetLevel(),
		Tags:            lo.Map(req.Msg.GetTags(), func(tag string, _ int) string { return tag }),
		Query:           req.Msg.GetQuery(),
		IncludeEpisodes: req.Msg.GetIncludeEpisodes(),
		AuthorIDs:       lo.Map(req.Msg.GetAuthorIds(), func(id string, _ int) string { return id }),
	}

	seriesList, nextToken, err := h.service.ListSeries(ctx, filter)
	if err != nil {
		return nil, err
	}

	protoSeries := make([]*lessionv1.Series, 0, len(seriesList))
	for i := range seriesList {
		protoSeries = append(protoSeries, toProtoSeries(&seriesList[i], filter.IncludeEpisodes))
	}

	return connect.NewResponse(&lessionv1.ListSeriesResponse{
		Series:        protoSeries,
		NextPageToken: nextToken,
	}), nil
}

// CreateSeries creates a series and optional initial episodes.
func (h *SeriesHandler) CreateSeries(ctx context.Context, req *connect.Request[lessionv1.CreateSeriesRequest]) (*connect.Response[lessionv1.CreateSeriesResponse], error) {
	draft, err := fromProtoSeriesDraft(req.Msg.GetSeries())
	if err != nil {
		return nil, err
	}

	created, err := h.service.CreateSeries(ctx, draft)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.CreateSeriesResponse{
		Series: toProtoSeries(created, true),
	}), nil
}

// GetSeries returns details for a single series.
func (h *SeriesHandler) GetSeries(ctx context.Context, req *connect.Request[lessionv1.GetSeriesRequest]) (*connect.Response[lessionv1.GetSeriesResponse], error) {
	id, err := uuid.Parse(req.Msg.GetSeriesId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid series_id %q", core.ErrValidation, req.Msg.GetSeriesId())
	}

	opts := core.SeriesQueryOptions{
		IncludeEpisodes: req.Msg.GetIncludeEpisodes(),
		IncludeMetadata: req.Msg.GetIncludeMetadata(),
	}
	series, err := h.service.GetSeries(ctx, id, opts)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.GetSeriesResponse{
		Series: toProtoSeries(series, opts.IncludeEpisodes),
	}), nil
}

// UpdateSeries applies partial updates to a series.
func (h *SeriesHandler) UpdateSeries(ctx context.Context, req *connect.Request[lessionv1.UpdateSeriesRequest]) (*connect.Response[lessionv1.UpdateSeriesResponse], error) {
	id, err := uuid.Parse(req.Msg.GetSeriesId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid series_id %q", core.ErrValidation, req.Msg.GetSeriesId())
	}

	existing, err := h.service.GetSeries(ctx, id, core.SeriesQueryOptions{})
	if err != nil {
		return nil, err
	}

	mask := req.Msg.GetUpdateMask()
	if isFieldMaskEmpty(mask) {
		mask = &fieldmaskpb.FieldMask{
			Paths: []string{"slug", "title", "summary", "language", "level", "tags", "cover_url", "status", "author_ids"},
		}
	}

	if err := applySeriesFieldMask(existing, req.Msg.GetSeries(), mask); err != nil {
		return nil, err
	}

	updated, err := h.service.UpdateSeries(ctx, *existing)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.UpdateSeriesResponse{
		Series: toProtoSeries(updated, false),
	}), nil
}

// CreateEpisode adds a new episode to an existing series.
func (h *SeriesHandler) CreateEpisode(ctx context.Context, req *connect.Request[lessionv1.CreateEpisodeRequest]) (*connect.Response[lessionv1.CreateEpisodeResponse], error) {
	seriesID, err := uuid.Parse(req.Msg.GetSeriesId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid series_id %q", core.ErrValidation, req.Msg.GetSeriesId())
	}

	draft, err := fromProtoEpisodeDraft(req.Msg.GetEpisode())
	if err != nil {
		return nil, err
	}

	result, err := h.service.CreateEpisode(ctx, core.CreateEpisodeParams{
		SeriesID: seriesID,
		Draft:    draft,
	})
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.CreateEpisodeResponse{
		Episode: toProtoEpisode(result),
	}), nil
}

// GetEpisode returns details for a single episode.
func (h *SeriesHandler) GetEpisode(ctx context.Context, req *connect.Request[lessionv1.GetEpisodeRequest]) (*connect.Response[lessionv1.GetEpisodeResponse], error) {
	id, err := uuid.Parse(req.Msg.GetEpisodeId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid episode_id %q", core.ErrValidation, req.Msg.GetEpisodeId())
	}

	episode, err := h.service.GetEpisode(ctx, id)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.GetEpisodeResponse{
		Episode: toProtoEpisode(episode),
	}), nil
}

// UpdateEpisode applies partial updates to an episode.
func (h *SeriesHandler) UpdateEpisode(ctx context.Context, req *connect.Request[lessionv1.UpdateEpisodeRequest]) (*connect.Response[lessionv1.UpdateEpisodeResponse], error) {
	id, err := uuid.Parse(req.Msg.GetEpisodeId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid episode_id %q", core.ErrValidation, req.Msg.GetEpisodeId())
	}

	existing, err := h.service.GetEpisode(ctx, id)
	if err != nil {
		return nil, err
	}

	mask := req.Msg.GetUpdateMask()
	if isFieldMaskEmpty(mask) {
		mask = &fieldmaskpb.FieldMask{
			Paths: []string{"seq", "title", "description", "duration", "status", "resource", "transcript"},
		}
	}

	if err := applyEpisodeFieldMask(existing, req.Msg.GetEpisode(), mask); err != nil {
		return nil, err
	}

	updated, err := h.service.UpdateEpisode(ctx, *existing)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.UpdateEpisodeResponse{
		Episode: toProtoEpisode(updated),
	}), nil
}

// DeleteEpisode performs a soft delete of an episode.
func (h *SeriesHandler) DeleteEpisode(ctx context.Context, req *connect.Request[lessionv1.DeleteEpisodeRequest]) (*connect.Response[lessionv1.DeleteEpisodeResponse], error) {
	id, err := uuid.Parse(req.Msg.GetEpisodeId())
	if err != nil {
		return nil, fmt.Errorf("%w: invalid episode_id %q", core.ErrValidation, req.Msg.GetEpisodeId())
	}

	episode, err := h.service.DeleteEpisode(ctx, id)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&lessionv1.DeleteEpisodeResponse{
		Episode: toProtoEpisode(episode),
	}), nil
}

func fromProtoSeriesDraft(draft *lessionv1.SeriesDraft) (core.SeriesDraft, error) {
	if draft == nil {
		return core.SeriesDraft{}, fmt.Errorf("%w: series draft required", core.ErrValidation)
	}
	status, err := fromProtoSeriesStatus(draft.GetStatus())
	if err != nil {
		return core.SeriesDraft{}, err
	}

	episodes := make([]core.EpisodeDraft, 0, len(draft.GetEpisodes()))
	for _, ep := range draft.GetEpisodes() {
		episodeDraft, err := fromProtoEpisodeDraft(ep)
		if err != nil {
			return core.SeriesDraft{}, err
		}
		episodes = append(episodes, episodeDraft)
	}

	return core.SeriesDraft{
		Slug:      draft.GetSlug(),
		Title:     draft.GetTitle(),
		Summary:   draft.GetSummary(),
		Language:  draft.GetLanguage(),
		Level:     draft.GetLevel(),
		Tags:      lo.Map(draft.GetTags(), func(tag string, _ int) string { return tag }),
		CoverURL:  draft.GetCoverUrl(),
		Status:    status,
		AuthorIDs: lo.Map(draft.GetAuthorIds(), func(id string, _ int) string { return id }),
		Episodes:  episodes,
	}, nil
}

func fromProtoEpisodeDraft(draft *lessionv1.EpisodeDraft) (core.EpisodeDraft, error) {
	if draft == nil {
		return core.EpisodeDraft{}, fmt.Errorf("%w: episode draft required", core.ErrValidation)
	}
	status, err := fromProtoEpisodeStatus(draft.GetStatus())
	if err != nil {
		return core.EpisodeDraft{}, err
	}

	var resource *core.MediaResource
	if draft.GetResource() != nil {
		res, err := fromProtoMediaResource(draft.GetResource())
		if err != nil {
			return core.EpisodeDraft{}, err
		}
		resource = &res
	}

	var transcript *core.Transcript
	if draft.GetTranscript() != nil {
		tr, err := fromProtoTranscript(draft.GetTranscript())
		if err != nil {
			return core.EpisodeDraft{}, err
		}
		transcript = &tr
	}

	var duration time.Duration
	if draft.GetDuration() != nil {
		duration = draft.GetDuration().AsDuration()
	}

	return core.EpisodeDraft{
		Seq:         draft.GetSeq(),
		Title:       draft.GetTitle(),
		Description: draft.GetDescription(),
		Duration:    duration,
		Status:      status,
		Resource:    resource,
		Transcript:  transcript,
	}, nil
}

func fromProtoMediaResource(resource *lessionv1.MediaResource) (core.MediaResource, error) {
	if resource == nil {
		return core.MediaResource{}, nil
	}

	var assetID uuid.UUID
	if resource.GetAssetId() != "" {
		id, err := uuid.Parse(resource.GetAssetId())
		if err != nil {
			return core.MediaResource{}, fmt.Errorf("%w: invalid asset_id %q", core.ErrValidation, resource.GetAssetId())
		}
		assetID = id
	}

	mediaType, err := seriesFromProtoMediaType(resource.GetType())
	if err != nil {
		return core.MediaResource{}, err
	}

	return core.MediaResource{
		AssetID:     assetID,
		Type:        mediaType,
		PlaybackURL: resource.GetPlaybackUrl(),
		MimeType:    resource.GetMimeType(),
	}, nil
}

func fromProtoTranscript(t *lessionv1.Transcript) (core.Transcript, error) {
	if t == nil {
		return core.Transcript{}, nil
	}
	format, err := fromProtoTranscriptFormat(t.GetFormat())
	if err != nil {
		return core.Transcript{}, err
	}
	return core.Transcript{
		Language: t.GetLanguage(),
		Format:   format,
		Content:  t.GetContent(),
	}, nil
}

func applySeriesFieldMask(target *core.Series, patch *lessionv1.SeriesDraft, mask *fieldmaskpb.FieldMask) error {
	for _, path := range mask.Paths {
		switch strings.ToLower(path) {
		case "slug":
			target.Slug = patch.GetSlug()
		case "title":
			target.Title = patch.GetTitle()
		case "summary":
			target.Summary = patch.GetSummary()
		case "language":
			target.Language = patch.GetLanguage()
		case "level":
			target.Level = patch.GetLevel()
		case "tags":
			tags := lo.Map(patch.GetTags(), func(tag string, _ int) string { return tag })
			target.Tags = lo.Ternary(len(tags) > 0, tags, []string(nil))
		case "cover_url":
			target.CoverURL = patch.GetCoverUrl()
		case "status":
			status, err := fromProtoSeriesStatus(patch.GetStatus())
			if err != nil {
				return err
			}
			target.Status = status
		case "author_ids":
			authorIDs := lo.Map(patch.GetAuthorIds(), func(id string, _ int) string { return id })
			target.AuthorIDs = lo.Ternary(len(authorIDs) > 0, authorIDs, []string(nil))
		default:
			return fmt.Errorf("%w: unsupported update path %q", core.ErrValidation, path)
		}
	}
	return nil
}

func applyEpisodeFieldMask(target *core.Episode, patch *lessionv1.EpisodeDraft, mask *fieldmaskpb.FieldMask) error {
	for _, path := range mask.Paths {
		switch strings.ToLower(path) {
		case "seq":
			target.Seq = patch.GetSeq()
		case "title":
			target.Title = patch.GetTitle()
		case "description":
			target.Description = patch.GetDescription()
		case "duration":
			if patch.GetDuration() != nil {
				target.Duration = patch.GetDuration().AsDuration()
			} else {
				target.Duration = 0
			}
		case "status":
			status, err := fromProtoEpisodeStatus(patch.GetStatus())
			if err != nil {
				return err
			}
			target.Status = status
		case "resource":
			if patch.GetResource() == nil {
				target.Resource = core.MediaResource{}
			} else {
				resource, err := fromProtoMediaResource(patch.GetResource())
				if err != nil {
					return err
				}
				target.Resource = resource
			}
		case "resource.asset_id":
			if patch.GetResource() == nil {
				target.Resource.AssetID = uuid.Nil
			} else if patch.GetResource().GetAssetId() == "" {
				target.Resource.AssetID = uuid.Nil
			} else {
				id, err := uuid.Parse(patch.GetResource().GetAssetId())
				if err != nil {
					return fmt.Errorf("%w: invalid asset_id %q", core.ErrValidation, patch.GetResource().GetAssetId())
				}
				target.Resource.AssetID = id
			}
		case "resource.type":
			if patch.GetResource() == nil {
				target.Resource.Type = core.MediaTypeUnspecified
			} else {
				mediaType, err := seriesFromProtoMediaType(patch.GetResource().GetType())
				if err != nil {
					return err
				}
				target.Resource.Type = mediaType
			}
		case "resource.playback_url":
			if patch.GetResource() == nil {
				target.Resource.PlaybackURL = ""
			} else {
				target.Resource.PlaybackURL = patch.GetResource().GetPlaybackUrl()
			}
		case "resource.mime_type":
			if patch.GetResource() == nil {
				target.Resource.MimeType = ""
			} else {
				target.Resource.MimeType = patch.GetResource().GetMimeType()
			}
		case "transcript":
			if patch.GetTranscript() == nil {
				target.Transcript = core.Transcript{}
			} else {
				transcript, err := fromProtoTranscript(patch.GetTranscript())
				if err != nil {
					return err
				}
				target.Transcript = transcript
			}
		case "transcript.language":
			if patch.GetTranscript() == nil {
				target.Transcript.Language = ""
			} else {
				target.Transcript.Language = patch.GetTranscript().GetLanguage()
			}
		case "transcript.format":
			if patch.GetTranscript() == nil {
				target.Transcript.Format = core.TranscriptFormatUnspecified
			} else {
				format, err := fromProtoTranscriptFormat(patch.GetTranscript().GetFormat())
				if err != nil {
					return err
				}
				target.Transcript.Format = format
			}
		case "transcript.content":
			if patch.GetTranscript() == nil {
				target.Transcript.Content = ""
			} else {
				target.Transcript.Content = patch.GetTranscript().GetContent()
			}
		default:
			return fmt.Errorf("%w: unsupported update path %q", core.ErrValidation, path)
		}
	}
	return nil
}

func toProtoSeries(series *core.Series, includeEpisodes bool) *lessionv1.Series {
	if series == nil {
		return nil
	}

	res := &lessionv1.Series{
		Id:           series.ID.String(),
		Slug:         series.Slug,
		Title:        series.Title,
		Summary:      series.Summary,
		Language:     series.Language,
		Level:        series.Level,
		Tags:         lo.Map(series.Tags, func(tag string, _ int) string { return tag }),
		CoverUrl:     series.CoverURL,
		Status:       toProtoSeriesStatus(series.Status),
		EpisodeCount: uint32(series.EpisodeCount),
		AuthorIds:    lo.Map(series.AuthorIDs, func(id string, _ int) string { return id }),
	}

	if !series.CreatedAt.IsZero() {
		res.CreatedAt = timestamppb.New(series.CreatedAt)
	}
	if !series.UpdatedAt.IsZero() {
		res.UpdatedAt = timestamppb.New(series.UpdatedAt)
	}
	if series.PublishedAt != nil {
		res.PublishedAt = timestamppb.New(*series.PublishedAt)
	}

	if includeEpisodes && len(series.Episodes) > 0 {
		res.Episodes = lo.Map(series.Episodes, func(ep core.Episode, _ int) *lessionv1.Episode {
			return toProtoEpisode(&ep)
		})
	}

	return res
}

func toProtoEpisode(episode *core.Episode) *lessionv1.Episode {
	if episode == nil {
		return nil
	}

	res := &lessionv1.Episode{
		Id:          episode.ID.String(),
		SeriesId:    episode.SeriesID.String(),
		Seq:         episode.Seq,
		Title:       episode.Title,
		Description: episode.Description,
		Status:      toProtoEpisodeStatus(episode.Status),
		Resource:    toProtoMediaResource(episode.Resource),
		Transcript:  toProtoTranscript(episode.Transcript),
	}

	if episode.Duration > 0 {
		res.Duration = durationpb.New(episode.Duration)
	}
	if !episode.CreatedAt.IsZero() {
		res.CreatedAt = timestamppb.New(episode.CreatedAt)
	}
	if !episode.UpdatedAt.IsZero() {
		res.UpdatedAt = timestamppb.New(episode.UpdatedAt)
	}
	if episode.PublishedAt != nil {
		res.PublishedAt = timestamppb.New(*episode.PublishedAt)
	}

	return res
}

func toProtoMediaResource(resource core.MediaResource) *lessionv1.MediaResource {
	res := &lessionv1.MediaResource{
		Type:        seriesToProtoMediaType(resource.Type),
		PlaybackUrl: resource.PlaybackURL,
		MimeType:    resource.MimeType,
	}
	if resource.AssetID != uuid.Nil {
		res.AssetId = resource.AssetID.String()
	}
	return res
}

func toProtoTranscript(t core.Transcript) *lessionv1.Transcript {
	return &lessionv1.Transcript{
		Language: t.Language,
		Format:   toProtoTranscriptFormat(t.Format),
		Content:  t.Content,
	}
}

func fromProtoSeriesStatus(status lessionv1.SeriesStatus) (core.SeriesStatus, error) {
	switch status {
	case lessionv1.SeriesStatus_SERIES_STATUS_UNSPECIFIED:
		return core.SeriesStatusUnspecified, nil
	case lessionv1.SeriesStatus_SERIES_STATUS_DRAFT:
		return core.SeriesStatusDraft, nil
	case lessionv1.SeriesStatus_SERIES_STATUS_PUBLISHED:
		return core.SeriesStatusPublished, nil
	case lessionv1.SeriesStatus_SERIES_STATUS_ARCHIVED:
		return core.SeriesStatusArchived, nil
	default:
		return core.SeriesStatusUnspecified, fmt.Errorf("%w: invalid series status %d", core.ErrValidation, status)
	}
}

func toProtoSeriesStatus(status core.SeriesStatus) lessionv1.SeriesStatus {
	switch status {
	case core.SeriesStatusDraft:
		return lessionv1.SeriesStatus_SERIES_STATUS_DRAFT
	case core.SeriesStatusPublished:
		return lessionv1.SeriesStatus_SERIES_STATUS_PUBLISHED
	case core.SeriesStatusArchived:
		return lessionv1.SeriesStatus_SERIES_STATUS_ARCHIVED
	case core.SeriesStatusUnspecified:
		fallthrough
	default:
		return lessionv1.SeriesStatus_SERIES_STATUS_UNSPECIFIED
	}
}

func fromProtoEpisodeStatus(status lessionv1.EpisodeStatus) (core.EpisodeStatus, error) {
	switch status {
	case lessionv1.EpisodeStatus_EPISODE_STATUS_UNSPECIFIED:
		return core.EpisodeStatusUnspecified, nil
	case lessionv1.EpisodeStatus_EPISODE_STATUS_DRAFT:
		return core.EpisodeStatusDraft, nil
	case lessionv1.EpisodeStatus_EPISODE_STATUS_READY:
		return core.EpisodeStatusReady, nil
	case lessionv1.EpisodeStatus_EPISODE_STATUS_PUBLISHED:
		return core.EpisodeStatusPublished, nil
	case lessionv1.EpisodeStatus_EPISODE_STATUS_ARCHIVED:
		return core.EpisodeStatusArchived, nil
	default:
		return core.EpisodeStatusUnspecified, fmt.Errorf("%w: invalid episode status %d", core.ErrValidation, status)
	}
}

func toProtoEpisodeStatus(status core.EpisodeStatus) lessionv1.EpisodeStatus {
	switch status {
	case core.EpisodeStatusDraft:
		return lessionv1.EpisodeStatus_EPISODE_STATUS_DRAFT
	case core.EpisodeStatusReady:
		return lessionv1.EpisodeStatus_EPISODE_STATUS_READY
	case core.EpisodeStatusPublished:
		return lessionv1.EpisodeStatus_EPISODE_STATUS_PUBLISHED
	case core.EpisodeStatusArchived:
		return lessionv1.EpisodeStatus_EPISODE_STATUS_ARCHIVED
	case core.EpisodeStatusUnspecified:
		fallthrough
	default:
		return lessionv1.EpisodeStatus_EPISODE_STATUS_UNSPECIFIED
	}
}

func seriesFromProtoMediaType(t lessionv1.MediaType) (core.MediaType, error) {
	switch t {
	case lessionv1.MediaType_MEDIA_TYPE_UNSPECIFIED:
		return core.MediaTypeUnspecified, nil
	case lessionv1.MediaType_MEDIA_TYPE_VIDEO:
		return core.MediaTypeVideo, nil
	case lessionv1.MediaType_MEDIA_TYPE_AUDIO:
		return core.MediaTypeAudio, nil
	default:
		return core.MediaTypeUnspecified, fmt.Errorf("%w: invalid media type %d", core.ErrValidation, t)
	}
}

func seriesToProtoMediaType(t core.MediaType) lessionv1.MediaType {
	switch t {
	case core.MediaTypeVideo:
		return lessionv1.MediaType_MEDIA_TYPE_VIDEO
	case core.MediaTypeAudio:
		return lessionv1.MediaType_MEDIA_TYPE_AUDIO
	case core.MediaTypeUnspecified:
		fallthrough
	default:
		return lessionv1.MediaType_MEDIA_TYPE_UNSPECIFIED
	}
}

func fromProtoTranscriptFormat(format lessionv1.TranscriptFormat) (core.TranscriptFormat, error) {
	switch format {
	case lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_UNSPECIFIED:
		return core.TranscriptFormatUnspecified, nil
	case lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_PLAIN:
		return core.TranscriptFormatPlain, nil
	case lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_MARKDOWN:
		return core.TranscriptFormatMarkdown, nil
	case lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_SRT:
		return core.TranscriptFormatSRT, nil
	case lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_JSON:
		return core.TranscriptFormatJSON, nil
	default:
		return core.TranscriptFormatUnspecified, fmt.Errorf("%w: invalid transcript format %d", core.ErrValidation, format)
	}
}

func toProtoTranscriptFormat(format core.TranscriptFormat) lessionv1.TranscriptFormat {
	switch format {
	case core.TranscriptFormatPlain:
		return lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_PLAIN
	case core.TranscriptFormatMarkdown:
		return lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_MARKDOWN
	case core.TranscriptFormatSRT:
		return lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_SRT
	case core.TranscriptFormatJSON:
		return lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_JSON
	case core.TranscriptFormatUnspecified:
		fallthrough
	default:
		return lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_UNSPECIFIED
	}
}

func fromProtoSeriesStatuses(statuses []lessionv1.SeriesStatus) ([]core.SeriesStatus, error) {
	if len(statuses) == 0 {
		return nil, nil
	}
	result := make([]core.SeriesStatus, 0, len(statuses))
	for _, s := range statuses {
		status, err := fromProtoSeriesStatus(s)
		if err != nil {
			return nil, err
		}
		result = append(result, status)
	}
	return result, nil
}
