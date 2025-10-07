package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/eslsoft/lession/internal/core"
)

func TestSeriesService_CreateSeries(t *testing.T) {
	fixedNow := time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC)
	var captured core.Series

	repo := &stubSeriesRepo{
		createSeriesFn: func(ctx context.Context, series core.Series) (*core.Series, error) {
			captured = series
			copy := series
			return &copy, nil
		},
	}

	service := NewSeriesService(repo)
	service.WithClock(func() time.Time { return fixedNow })

	draft := core.SeriesDraft{
		Slug:     "intro",
		Title:    "Introduction",
		Summary:  "Overview",
		Language: "en",
		Tags:     []string{"tag"},
		Episodes: []core.EpisodeDraft{
			{
				Seq:      1,
				Title:    "Episode 1",
				Status:   core.EpisodeStatusUnspecified,
				Resource: &core.MediaResource{AssetID: uuid.New(), Type: core.MediaTypeAudio},
			},
		},
	}

	got, err := service.CreateSeries(context.Background(), draft)
	if err != nil {
		t.Fatalf("CreateSeries() error = %v", err)
	}
	if got == nil {
		t.Fatal("CreateSeries() returned nil series")
	}
	if captured.ID == uuid.Nil {
		t.Fatal("expected generated series ID")
	}
	if captured.Status != core.SeriesStatusDraft {
		t.Fatalf("expected status default to draft, got %v", captured.Status)
	}
	if captured.CreatedAt != fixedNow {
		t.Fatalf("expected CreatedAt %v, got %v", fixedNow, captured.CreatedAt)
	}
	if captured.UpdatedAt != fixedNow {
		t.Fatalf("expected UpdatedAt %v, got %v", fixedNow, captured.UpdatedAt)
	}
	if captured.EpisodeCount != 1 {
		t.Fatalf("expected EpisodeCount 1, got %d", captured.EpisodeCount)
	}
	if len(captured.Episodes) != 1 {
		t.Fatalf("expected 1 episode, got %d", len(captured.Episodes))
	}
	episode := captured.Episodes[0]
	if episode.SeriesID != captured.ID {
		t.Fatalf("expected episode SeriesID %v, got %v", captured.ID, episode.SeriesID)
	}
	if episode.Status != core.EpisodeStatusDraft {
		t.Fatalf("expected episode status default to draft, got %v", episode.Status)
	}
	if episode.CreatedAt != fixedNow {
		t.Fatalf("expected episode CreatedAt %v, got %v", fixedNow, episode.CreatedAt)
	}
	if episode.UpdatedAt != fixedNow {
		t.Fatalf("expected episode UpdatedAt %v, got %v", fixedNow, episode.UpdatedAt)
	}
}

func TestSeriesService_CreateSeriesDuplicateSequence(t *testing.T) {
	repo := &stubSeriesRepo{
		createSeriesFn: func(ctx context.Context, series core.Series) (*core.Series, error) {
			return nil, errors.New("should not be called")
		},
	}
	service := NewSeriesService(repo)

	draft := core.SeriesDraft{
		Slug:  "slug",
		Title: "title",
		Episodes: []core.EpisodeDraft{
			{Seq: 1, Title: "a"},
			{Seq: 1, Title: "b"},
		},
	}

	if _, err := service.CreateSeries(context.Background(), draft); err == nil {
		t.Fatal("expected error for duplicate episode seq")
	}
}

func TestSeriesService_UpdateSeries(t *testing.T) {
	fixedNow := time.Date(2024, 2, 3, 4, 5, 6, 0, time.UTC)
	var captured core.Series

	repo := &stubSeriesRepo{
		updateSeriesFn: func(ctx context.Context, series core.Series) (*core.Series, error) {
			captured = series
			copy := series
			return &copy, nil
		},
	}
	service := NewSeriesService(repo)
	service.WithClock(func() time.Time { return fixedNow })

	series := core.Series{
		ID:     uuid.New(),
		Status: core.SeriesStatusPublished,
	}

	if _, err := service.UpdateSeries(context.Background(), core.Series{}); err == nil {
		t.Fatal("expected error for missing ID")
	}

	got, err := service.UpdateSeries(context.Background(), series)
	if err != nil {
		t.Fatalf("UpdateSeries() error = %v", err)
	}
	if got == nil {
		t.Fatal("UpdateSeries() returned nil series")
	}
	if captured.UpdatedAt != fixedNow {
		t.Fatalf("expected UpdatedAt %v, got %v", fixedNow, captured.UpdatedAt)
	}
	if captured.PublishedAt == nil || !captured.PublishedAt.Equal(fixedNow) {
		t.Fatalf("expected PublishedAt to be set to %v", fixedNow)
	}
}

func TestSeriesService_GetSeriesValidation(t *testing.T) {
	service := NewSeriesService(&stubSeriesRepo{})
	if _, err := service.GetSeries(context.Background(), uuid.Nil, core.SeriesQueryOptions{}); err == nil {
		t.Fatal("expected error for missing ID")
	}
}

func TestSeriesService_CreateEpisode(t *testing.T) {
	fixedNow := time.Date(2024, 3, 4, 5, 6, 7, 0, time.UTC)
	var captured core.Episode

	repo := &stubSeriesRepo{
		createEpisodeFn: func(ctx context.Context, episode core.Episode) (*core.Episode, error) {
			captured = episode
			copy := episode
			return &copy, nil
		},
	}
	service := NewSeriesService(repo)
	service.WithClock(func() time.Time { return fixedNow })

	params := core.CreateEpisodeParams{
		SeriesID: uuid.New(),
		Draft: core.EpisodeDraft{
			Seq:   1,
			Title: "Episode",
		},
	}

	if _, err := service.CreateEpisode(context.Background(), core.CreateEpisodeParams{}); err == nil {
		t.Fatal("expected error for missing series id")
	}

	got, err := service.CreateEpisode(context.Background(), params)
	if err != nil {
		t.Fatalf("CreateEpisode() error = %v", err)
	}
	if got == nil {
		t.Fatal("CreateEpisode() returned nil episode")
	}
	if captured.ID == uuid.Nil {
		t.Fatal("expected generated episode ID")
	}
	if captured.CreatedAt != fixedNow {
		t.Fatalf("expected CreatedAt %v, got %v", fixedNow, captured.CreatedAt)
	}
	if captured.Status != core.EpisodeStatusDraft {
		t.Fatalf("expected status default to draft, got %v", captured.Status)
	}
}

func TestSeriesService_GetEpisodeValidation(t *testing.T) {
	service := NewSeriesService(&stubSeriesRepo{})
	if _, err := service.GetEpisode(context.Background(), uuid.Nil); err == nil {
		t.Fatal("expected error for missing ID")
	}
}

func TestSeriesService_UpdateEpisode(t *testing.T) {
	fixedNow := time.Date(2024, 5, 6, 7, 8, 9, 0, time.UTC)
	var captured core.Episode

	repo := &stubSeriesRepo{
		updateEpisodeFn: func(ctx context.Context, episode core.Episode) (*core.Episode, error) {
			captured = episode
			copy := episode
			return &copy, nil
		},
	}
	service := NewSeriesService(repo)
	service.WithClock(func() time.Time { return fixedNow })

	episode := core.Episode{
		ID:       uuid.New(),
		SeriesID: uuid.New(),
		Status:   core.EpisodeStatusPublished,
	}

	if _, err := service.UpdateEpisode(context.Background(), core.Episode{}); err == nil {
		t.Fatal("expected error for missing episode id")
	}

	if _, err := service.UpdateEpisode(context.Background(), core.Episode{ID: uuid.New()}); err == nil {
		t.Fatal("expected error for missing series id")
	}

	got, err := service.UpdateEpisode(context.Background(), episode)
	if err != nil {
		t.Fatalf("UpdateEpisode() error = %v", err)
	}
	if got == nil {
		t.Fatal("UpdateEpisode() returned nil episode")
	}
	if captured.UpdatedAt != fixedNow {
		t.Fatalf("expected UpdatedAt %v, got %v", fixedNow, captured.UpdatedAt)
	}
	if captured.PublishedAt == nil || !captured.PublishedAt.Equal(fixedNow) {
		t.Fatalf("expected PublishedAt to be set to %v", fixedNow)
	}
}

func TestSeriesService_DeleteEpisodeValidation(t *testing.T) {
	service := NewSeriesService(&stubSeriesRepo{})
	if _, err := service.DeleteEpisode(context.Background(), uuid.Nil); err == nil {
		t.Fatal("expected error for missing ID")
	}
}

type stubSeriesRepo struct {
	listSeriesFn    func(ctx context.Context, filter core.SeriesListFilter) ([]core.Series, string, error)
	createSeriesFn  func(ctx context.Context, series core.Series) (*core.Series, error)
	getSeriesFn     func(ctx context.Context, id uuid.UUID, opts core.SeriesQueryOptions) (*core.Series, error)
	updateSeriesFn  func(ctx context.Context, series core.Series) (*core.Series, error)
	createEpisodeFn func(ctx context.Context, episode core.Episode) (*core.Episode, error)
	getEpisodeFn    func(ctx context.Context, id uuid.UUID) (*core.Episode, error)
	updateEpisodeFn func(ctx context.Context, episode core.Episode) (*core.Episode, error)
	deleteEpisodeFn func(ctx context.Context, id uuid.UUID) (*core.Episode, error)
}

func (s *stubSeriesRepo) ListSeries(ctx context.Context, filter core.SeriesListFilter) ([]core.Series, string, error) {
	if s.listSeriesFn != nil {
		return s.listSeriesFn(ctx, filter)
	}
	return nil, "", nil
}

func (s *stubSeriesRepo) CreateSeries(ctx context.Context, series core.Series) (*core.Series, error) {
	if s.createSeriesFn != nil {
		return s.createSeriesFn(ctx, series)
	}
	return nil, nil
}

func (s *stubSeriesRepo) GetSeries(ctx context.Context, id uuid.UUID, opts core.SeriesQueryOptions) (*core.Series, error) {
	if s.getSeriesFn != nil {
		return s.getSeriesFn(ctx, id, opts)
	}
	return nil, nil
}

func (s *stubSeriesRepo) UpdateSeries(ctx context.Context, series core.Series) (*core.Series, error) {
	if s.updateSeriesFn != nil {
		return s.updateSeriesFn(ctx, series)
	}
	return nil, nil
}

func (s *stubSeriesRepo) CreateEpisode(ctx context.Context, episode core.Episode) (*core.Episode, error) {
	if s.createEpisodeFn != nil {
		return s.createEpisodeFn(ctx, episode)
	}
	return nil, nil
}

func (s *stubSeriesRepo) GetEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	if s.getEpisodeFn != nil {
		return s.getEpisodeFn(ctx, id)
	}
	return nil, nil
}

func (s *stubSeriesRepo) UpdateEpisode(ctx context.Context, episode core.Episode) (*core.Episode, error) {
	if s.updateEpisodeFn != nil {
		return s.updateEpisodeFn(ctx, episode)
	}
	return nil, nil
}

func (s *stubSeriesRepo) DeleteEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	if s.deleteEpisodeFn != nil {
		return s.deleteEpisodeFn(ctx, id)
	}
	return nil, nil
}
