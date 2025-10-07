package db

import (
	"context"
	stdsql "database/sql"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	"github.com/eslsoft/lession/internal/adapter/db/ent/generated/enttest"
	"github.com/eslsoft/lession/internal/core"
)

func TestSeriesRepository_CreateAndGetSeries(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	repo, client := setupSeriesRepo(t, ctx)
	defer client.Close()

	now := time.Date(2024, 1, 1, 10, 0, 0, 0, time.UTC)
	seriesID := uuid.New()
	episodeID := uuid.New()

	series := core.Series{
		ID:           seriesID,
		Slug:         "intro-series",
		Title:        "Intro Series",
		Summary:      "Overview",
		Language:     "en",
		Level:        "beginner",
		Tags:         []string{"intro", "english"},
		CoverURL:     "https://cdn.local/cover.png",
		Status:       core.SeriesStatusPublished,
		EpisodeCount: 1,
		CreatedAt:    now,
		UpdatedAt:    now,
		PublishedAt:  &now,
		AuthorIDs:    []string{"author-1"},
		Episodes: []core.Episode{
			{
				ID:       episodeID,
				SeriesID: seriesID,
				Seq:      1,
				Title:    "Episode 1",
				Duration: time.Minute * 5,
				Status:   core.EpisodeStatusPublished,
				Resource: core.MediaResource{AssetID: uuid.New(), Type: core.MediaTypeAudio, PlaybackURL: "https://cdn.local/audio.mp3", MimeType: "audio/mpeg"},
				Transcript: core.Transcript{
					Language: "en",
					Format:   core.TranscriptFormatPlain,
					Content:  "Hello world",
				},
				CreatedAt:   now,
				UpdatedAt:   now,
				PublishedAt: &now,
			},
		},
	}

	created, err := repo.CreateSeries(ctx, series)
	if err != nil {
		t.Fatalf("CreateSeries() error = %v", err)
	}
	if created == nil {
		t.Fatal("CreateSeries() returned nil")
	}
	if created.EpisodeCount != 1 {
		t.Fatalf("expected episode count 1, got %d", created.EpisodeCount)
	}
	if len(created.Episodes) != 1 {
		t.Fatalf("expected 1 episode, got %d", len(created.Episodes))
	}

	got, err := repo.GetSeries(ctx, seriesID, core.SeriesQueryOptions{IncludeEpisodes: true})
	if err != nil {
		t.Fatalf("GetSeries() error = %v", err)
	}
	if got == nil {
		t.Fatal("GetSeries() returned nil")
	}
	if got.Title != "Intro Series" {
		t.Fatalf("unexpected title %q", got.Title)
	}
	if len(got.Episodes) != 1 {
		t.Fatalf("expected 1 episode, got %d", len(got.Episodes))
	}
	if got.Episodes[0].Seq != 1 {
		t.Fatalf("expected seq 1, got %d", got.Episodes[0].Seq)
	}
	if got.Episodes[0].Resource.PlaybackURL != "https://cdn.local/audio.mp3" {
		t.Fatalf("unexpected playback url %q", got.Episodes[0].Resource.PlaybackURL)
	}
}

func TestSeriesRepository_ListSeriesFilters(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	repo, client := setupSeriesRepo(t, ctx)
	defer client.Close()

	now := time.Date(2024, 2, 2, 10, 0, 0, 0, time.UTC)

	createSeriesForTest(t, repo, ctx, core.Series{
		ID:           uuid.New(),
		Slug:         "english-basics",
		Title:        "English Basics",
		Language:     "en",
		Level:        "beginner",
		Tags:         []string{"english"},
		Status:       core.SeriesStatusPublished,
		CreatedAt:    now,
		UpdatedAt:    now,
		EpisodeCount: 0,
	})

	createSeriesForTest(t, repo, ctx, core.Series{
		ID:           uuid.New(),
		Slug:         "chinese-basics",
		Title:        "Chinese Basics",
		Language:     "zh",
		Level:        "beginner",
		Tags:         []string{"chinese"},
		Status:       core.SeriesStatusDraft,
		CreatedAt:    now,
		UpdatedAt:    now,
		EpisodeCount: 0,
	})

	res, token, err := repo.ListSeries(ctx, core.SeriesListFilter{
		Language: "en",
	})
	if err != nil {
		t.Fatalf("ListSeries() error = %v", err)
	}
	if token != "" {
		t.Fatalf("expected empty next token, got %q", token)
	}
	if len(res) != 1 {
		t.Fatalf("expected 1 series, got %d", len(res))
	}
	if res[0].Slug != "english-basics" {
		t.Fatalf("unexpected slug %q", res[0].Slug)
	}

	res, _, err = repo.ListSeries(ctx, core.SeriesListFilter{
		Statuses: []core.SeriesStatus{core.SeriesStatusDraft},
	})
	if err != nil {
		t.Fatalf("ListSeries() error = %v", err)
	}
	if len(res) != 1 || res[0].Slug != "chinese-basics" {
		t.Fatalf("expected chinese-basics, got %#v", res)
	}
}

func TestSeriesRepository_EpisodeLifecycle(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	repo, client := setupSeriesRepo(t, ctx)
	defer client.Close()

	now := time.Date(2024, 3, 3, 10, 0, 0, 0, time.UTC)
	series := core.Series{
		ID:           uuid.New(),
		Slug:         "series-one",
		Title:        "Series One",
		Status:       core.SeriesStatusDraft,
		CreatedAt:    now,
		UpdatedAt:    now,
		EpisodeCount: 0,
	}

	if _, err := repo.CreateSeries(ctx, series); err != nil {
		t.Fatalf("CreateSeries() error = %v", err)
	}

	episodeID := uuid.New()
	episode := core.Episode{
		ID:        episodeID,
		SeriesID:  series.ID,
		Seq:       1,
		Title:     "Episode 1",
		Duration:  time.Minute,
		Status:    core.EpisodeStatusDraft,
		CreatedAt: now,
		UpdatedAt: now,
	}

	createdEpisode, err := repo.CreateEpisode(ctx, episode)
	if err != nil {
		t.Fatalf("CreateEpisode() error = %v", err)
	}
	if createdEpisode == nil {
		t.Fatal("CreateEpisode() returned nil")
	}
	if createdEpisode.Seq != 1 {
		t.Fatalf("expected seq 1, got %d", createdEpisode.Seq)
	}

	seriesAfterCreate, err := repo.GetSeries(ctx, series.ID, core.SeriesQueryOptions{})
	if err != nil {
		t.Fatalf("GetSeries() error = %v", err)
	}
	if seriesAfterCreate.EpisodeCount != 1 {
		t.Fatalf("expected episode count 1, got %d", seriesAfterCreate.EpisodeCount)
	}

	updateTime := now.Add(time.Hour)
	episodeUpdate := core.Episode{
		ID:          episodeID,
		SeriesID:    series.ID,
		Seq:         2,
		Title:       "Episode 1 updated",
		Duration:    time.Minute * 2,
		Status:      core.EpisodeStatusPublished,
		PublishedAt: &updateTime,
		UpdatedAt:   updateTime,
		Resource: core.MediaResource{
			Type: core.MediaTypeVideo,
		},
		Transcript: core.Transcript{
			Language: "en",
			Format:   core.TranscriptFormatPlain,
			Content:  "Updated",
		},
	}

	updatedEpisode, err := repo.UpdateEpisode(ctx, episodeUpdate)
	if err != nil {
		t.Fatalf("UpdateEpisode() error = %v", err)
	}
	if updatedEpisode.Seq != 2 {
		t.Fatalf("expected seq 2 after update, got %d", updatedEpisode.Seq)
	}
	if updatedEpisode.Status != core.EpisodeStatusPublished {
		t.Fatalf("expected status published, got %v", updatedEpisode.Status)
	}
	if updatedEpisode.PublishedAt == nil {
		t.Fatalf("expected published at set")
	}

	deletedEpisode, err := repo.DeleteEpisode(ctx, episodeID)
	if err != nil {
		t.Fatalf("DeleteEpisode() error = %v", err)
	}
	if deletedEpisode.DeletedAt == nil {
		t.Fatalf("expected deleted at set")
	}
	if deletedEpisode.Status != core.EpisodeStatusArchived {
		t.Fatalf("expected status archived after delete, got %v", deletedEpisode.Status)
	}

	seriesAfterDelete, err := repo.GetSeries(ctx, series.ID, core.SeriesQueryOptions{})
	if err != nil {
		t.Fatalf("GetSeries() error = %v", err)
	}
	if seriesAfterDelete.EpisodeCount != 0 {
		t.Fatalf("expected episode count 0 after delete, got %d", seriesAfterDelete.EpisodeCount)
	}
}

func setupSeriesRepo(t *testing.T, ctx context.Context) (*SeriesRepository, *entgenerated.Client) {
	t.Helper()
	drv, err := stdsql.Open("sqlite", "file:series_repo?mode=memory&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("failed opening sqlite driver: %v", err)
	}
	driver := entsql.OpenDB(dialect.SQLite, drv)
	client := enttest.NewClient(t, enttest.WithOptions(entgenerated.Driver(driver)))
	if err := client.Schema.Create(ctx); err != nil {
		t.Fatalf("failed creating schema: %v", err)
	}
	return NewSeriesRepository(client), client
}

func createSeriesForTest(t *testing.T, repo *SeriesRepository, ctx context.Context, series core.Series) {
	t.Helper()
	if series.ID == uuid.Nil {
		series.ID = uuid.New()
	}
	if series.CreatedAt.IsZero() {
		series.CreatedAt = time.Now().UTC()
	}
	if series.UpdatedAt.IsZero() {
		series.UpdatedAt = series.CreatedAt
	}
	if _, err := repo.CreateSeries(ctx, series); err != nil {
		t.Fatalf("CreateSeries() error = %v", err)
	}
}
