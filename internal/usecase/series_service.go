package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/samber/lo"

	"github.com/eslsoft/lession/internal/core"
)

// SeriesService coordinates series-related use cases.
type SeriesService struct {
	repo core.SeriesRepository
	now  func() time.Time
}

// NewSeriesService constructs a SeriesService backed by the provided repository.
func NewSeriesService(repo core.SeriesRepository) *SeriesService {
	return &SeriesService{
		repo: repo,
		now:  time.Now,
	}
}

// WithClock allows tests to override the clock used by the service.
func (s *SeriesService) WithClock(fn func() time.Time) {
	if fn != nil {
		s.now = fn
	}
}

var _ core.SeriesService = (*SeriesService)(nil)

// ListSeries returns a filtered, paginated collection of series.
func (s *SeriesService) ListSeries(ctx context.Context, filter core.SeriesListFilter) ([]core.Series, string, error) {
	return s.repo.ListSeries(ctx, filter)
}

// CreateSeries creates a series and optional initial episodes.
func (s *SeriesService) CreateSeries(ctx context.Context, draft core.SeriesDraft) (*core.Series, error) {
	now := s.now().UTC()
	seriesID := uuid.New()

	status := draft.Status
	if status == core.SeriesStatusUnspecified {
		status = core.SeriesStatusDraft
	}

	tags := lo.Map(draft.Tags, func(tag string, _ int) string { return tag })
	authorIDs := lo.Map(draft.AuthorIDs, func(id string, _ int) string { return id })

	series := core.Series{
		ID:        seriesID,
		Slug:      draft.Slug,
		Title:     draft.Title,
		Summary:   draft.Summary,
		Language:  draft.Language,
		Level:     draft.Level,
		Tags:      lo.Ternary(len(tags) > 0, tags, []string(nil)),
		CoverURL:  draft.CoverURL,
		Status:    status,
		CreatedAt: now,
		UpdatedAt: now,
		AuthorIDs: lo.Ternary(len(authorIDs) > 0, authorIDs, []string(nil)),
	}

	if status == core.SeriesStatusPublished {
		series.PublishedAt = ptrTime(now)
	}

	if len(draft.Episodes) > 0 {
		episodes := make([]core.Episode, 0, len(draft.Episodes))
		seqSeen := make(map[uint32]struct{}, len(draft.Episodes))
		for _, ed := range draft.Episodes {
			if _, exists := seqSeen[ed.Seq]; exists {
				return nil, fmt.Errorf("%w: duplicate episode seq %d", core.ErrValidation, ed.Seq)
			}
			seqSeen[ed.Seq] = struct{}{}

			episode, err := s.buildEpisodeFromDraft(seriesID, ed, now)
			if err != nil {
				return nil, err
			}
			episodes = append(episodes, episode)
		}
		series.Episodes = episodes
		series.EpisodeCount = len(episodes)
	}

	return s.repo.CreateSeries(ctx, series)
}

// GetSeries returns details for a single series.
func (s *SeriesService) GetSeries(ctx context.Context, id uuid.UUID, opts core.SeriesQueryOptions) (*core.Series, error) {
	if id == uuid.Nil {
		return nil, fmt.Errorf("%w: series id required", core.ErrValidation)
	}
	return s.repo.GetSeries(ctx, id, opts)
}

// UpdateSeries applies updates to a series.
func (s *SeriesService) UpdateSeries(ctx context.Context, series core.Series) (*core.Series, error) {
	if series.ID == uuid.Nil {
		return nil, fmt.Errorf("%w: series id required", core.ErrValidation)
	}
	if series.Status == core.SeriesStatusUnspecified {
		return nil, fmt.Errorf("%w: series status required", core.ErrValidation)
	}
	series.UpdatedAt = s.now().UTC()
	if series.Status == core.SeriesStatusPublished && series.PublishedAt == nil {
		series.PublishedAt = ptrTime(series.UpdatedAt)
	}
	return s.repo.UpdateSeries(ctx, series)
}

// CreateEpisode adds a new episode to an existing series.
func (s *SeriesService) CreateEpisode(ctx context.Context, params core.CreateEpisodeParams) (*core.Episode, error) {
	if params.SeriesID == uuid.Nil {
		return nil, fmt.Errorf("%w: series id required", core.ErrValidation)
	}

	now := s.now().UTC()
	episode, err := s.buildEpisodeFromDraft(params.SeriesID, params.Draft, now)
	if err != nil {
		return nil, err
	}
	return s.repo.CreateEpisode(ctx, episode)
}

// GetEpisode returns details for a single episode.
func (s *SeriesService) GetEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	if id == uuid.Nil {
		return nil, fmt.Errorf("%w: episode id required", core.ErrValidation)
	}
	return s.repo.GetEpisode(ctx, id)
}

// UpdateEpisode applies updates to an episode.
func (s *SeriesService) UpdateEpisode(ctx context.Context, episode core.Episode) (*core.Episode, error) {
	if episode.ID == uuid.Nil {
		return nil, fmt.Errorf("%w: episode id required", core.ErrValidation)
	}
	if episode.SeriesID == uuid.Nil {
		return nil, fmt.Errorf("%w: series id required", core.ErrValidation)
	}
	if episode.Status == core.EpisodeStatusUnspecified {
		return nil, fmt.Errorf("%w: episode status required", core.ErrValidation)
	}
	episode.UpdatedAt = s.now().UTC()
	if episode.Status == core.EpisodeStatusPublished && episode.PublishedAt == nil {
		episode.PublishedAt = ptrTime(episode.UpdatedAt)
	}
	return s.repo.UpdateEpisode(ctx, episode)
}

// DeleteEpisode performs a soft delete on an episode.
func (s *SeriesService) DeleteEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	if id == uuid.Nil {
		return nil, fmt.Errorf("%w: episode id required", core.ErrValidation)
	}
	return s.repo.DeleteEpisode(ctx, id)
}

func (s *SeriesService) buildEpisodeFromDraft(seriesID uuid.UUID, draft core.EpisodeDraft, now time.Time) (core.Episode, error) {
	status := draft.Status
	if status == core.EpisodeStatusUnspecified {
		status = core.EpisodeStatusDraft
	}

	var resource core.MediaResource
	if draft.Resource != nil {
		resource = *draft.Resource
	}

	var transcript core.Transcript
	if draft.Transcript != nil {
		transcript = *draft.Transcript
	}

	episode := core.Episode{
		ID:          uuid.New(),
		SeriesID:    seriesID,
		Seq:         draft.Seq,
		Title:       draft.Title,
		Description: draft.Description,
		Duration:    draft.Duration,
		Status:      status,
		Resource:    resource,
		Transcript:  transcript,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if status == core.EpisodeStatusPublished {
		episode.PublishedAt = ptrTime(now)
	}

	return episode, nil
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
