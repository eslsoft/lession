package core

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// SeriesStatus denotes the lifecycle stage for a series.
type SeriesStatus int

const (
	SeriesStatusUnspecified SeriesStatus = iota
	SeriesStatusDraft
	SeriesStatusPublished
	SeriesStatusArchived
)

// EpisodeStatus denotes the lifecycle stage for an episode.
type EpisodeStatus int

const (
	EpisodeStatusUnspecified EpisodeStatus = iota
	EpisodeStatusDraft
	EpisodeStatusReady
	EpisodeStatusPublished
	EpisodeStatusArchived
)

// MediaType enumerates the media asset class bound to an episode.
type MediaType int

const (
	MediaTypeUnspecified MediaType = iota
	MediaTypeVideo
	MediaTypeAudio
)

// TranscriptFormat enumerates supported transcript encodings.
type TranscriptFormat int

const (
	TranscriptFormatUnspecified TranscriptFormat = iota
	TranscriptFormatPlain
	TranscriptFormatMarkdown
	TranscriptFormatSRT
	TranscriptFormatJSON
)

// MediaResource binds an uploaded asset to an episode.
type MediaResource struct {
	AssetID     uuid.UUID
	Type        MediaType
	PlaybackURL string
	MimeType    string
}

// Transcript stores the textual script for an episode.
type Transcript struct {
	Language string
	Format   TranscriptFormat
	Content  string
}

// Episode represents a persisted content unit within a series.
type Episode struct {
	ID          uuid.UUID
	SeriesID    uuid.UUID
	Seq         uint32
	Title       string
	Description string
	Duration    time.Duration
	Status      EpisodeStatus
	Resource    MediaResource
	Transcript  Transcript
	CreatedAt   time.Time
	UpdatedAt   time.Time
	PublishedAt *time.Time
	DeletedAt   *time.Time
}

// Series represents a persisted series.
type Series struct {
	ID           uuid.UUID
	Slug         string
	Title        string
	Summary      string
	Language     string
	Level        string
	Tags         []string
	CoverURL     string
	Status       SeriesStatus
	EpisodeCount int
	CreatedAt    time.Time
	UpdatedAt    time.Time
	PublishedAt  *time.Time
	AuthorIDs    []string
	Episodes     []Episode
}

// SeriesDraft contains user-modifiable series attributes.
type SeriesDraft struct {
	Slug      string
	Title     string
	Summary   string
	Language  string
	Level     string
	Tags      []string
	CoverURL  string
	Status    SeriesStatus
	AuthorIDs []string
	Episodes  []EpisodeDraft
}

// EpisodeDraft contains user-modifiable episode attributes.
type EpisodeDraft struct {
	Seq         uint32
	Title       string
	Description string
	Duration    time.Duration
	Status      EpisodeStatus
	Resource    *MediaResource
	Transcript  *Transcript
}

// SeriesListFilter describes pagination and filtering options when listing series.
type SeriesListFilter struct {
	PageSize        int
	PageToken       string
	Statuses        []SeriesStatus
	Language        string
	Level           string
	Tags            []string
	Query           string
	IncludeEpisodes bool
	AuthorIDs       []string
}

// SeriesQueryOptions customise loaded associations for a single series.
type SeriesQueryOptions struct {
	IncludeEpisodes bool
	IncludeMetadata bool
}

// CreateEpisodeParams describes the inputs required to create an episode.
type CreateEpisodeParams struct {
	SeriesID uuid.UUID
	Draft    EpisodeDraft
}

// SeriesRepository defines persistence operations for series and episodes.
type SeriesRepository interface {
	ListSeries(ctx context.Context, filter SeriesListFilter) ([]Series, string, error)
	CreateSeries(ctx context.Context, series Series) (*Series, error)
	GetSeries(ctx context.Context, id uuid.UUID, opts SeriesQueryOptions) (*Series, error)
	UpdateSeries(ctx context.Context, series Series) (*Series, error)
	CreateEpisode(ctx context.Context, episode Episode) (*Episode, error)
	GetEpisode(ctx context.Context, id uuid.UUID) (*Episode, error)
	UpdateEpisode(ctx context.Context, episode Episode) (*Episode, error)
	DeleteEpisode(ctx context.Context, id uuid.UUID) (*Episode, error)
}

// SeriesService exposes the series use cases to adapters.
type SeriesService interface {
	ListSeries(ctx context.Context, filter SeriesListFilter) ([]Series, string, error)
	CreateSeries(ctx context.Context, draft SeriesDraft) (*Series, error)
	GetSeries(ctx context.Context, id uuid.UUID, opts SeriesQueryOptions) (*Series, error)
	UpdateSeries(ctx context.Context, series Series) (*Series, error)
	CreateEpisode(ctx context.Context, params CreateEpisodeParams) (*Episode, error)
	GetEpisode(ctx context.Context, id uuid.UUID) (*Episode, error)
	UpdateEpisode(ctx context.Context, episode Episode) (*Episode, error)
	DeleteEpisode(ctx context.Context, id uuid.UUID) (*Episode, error)
}
