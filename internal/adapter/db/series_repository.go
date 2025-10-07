package db

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
	"github.com/google/uuid"
	"github.com/samber/lo"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	entepisode "github.com/eslsoft/lession/internal/adapter/db/ent/generated/episode"
	entseries "github.com/eslsoft/lession/internal/adapter/db/ent/generated/series"
	"github.com/eslsoft/lession/internal/core"
)

// SeriesRepository persists series and episodes using Ent.
type SeriesRepository struct {
	client *entgenerated.Client
}

// NewSeriesRepository constructs an Ent-backed series repository.
func NewSeriesRepository(client *entgenerated.Client) *SeriesRepository {
	return &SeriesRepository{client: client}
}

var _ core.SeriesRepository = (*SeriesRepository)(nil)

// ListSeries retrieves series matching the supplied filter.
func (r *SeriesRepository) ListSeries(ctx context.Context, filter core.SeriesListFilter) ([]core.Series, string, error) {
	offset, err := parseOffsetToken(filter.PageToken)
	if err != nil {
		return nil, "", err
	}

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	q := r.client.Series.Query()

	if len(filter.Statuses) > 0 {
		statuses := lo.Map(filter.Statuses, func(s core.SeriesStatus, _ int) int {
			return int(s)
		})
		q = q.Where(entseries.StatusIn(statuses...))
	}

	if filter.Language != "" {
		q = q.Where(entseries.LanguageEQ(filter.Language))
	}

	if filter.Level != "" {
		q = q.Where(entseries.LevelEQ(filter.Level))
	}

	if len(filter.AuthorIDs) > 0 {
		q = q.Where(func(s *sql.Selector) {
			ors := lo.Map(filter.AuthorIDs, func(authorID string, _ int) *sql.Predicate {
				return sqljson.ValueContains(entseries.FieldAuthorIds, authorID)
			})
			s.Where(sql.Or(ors...))
		})
	}

	if len(filter.Tags) > 0 {
		q = q.Where(func(s *sql.Selector) {
			ors := lo.Map(filter.Tags, func(tag string, _ int) *sql.Predicate {
				return sqljson.ValueContains(entseries.FieldTags, tag)
			})
			s.Where(sql.Or(ors...))
		})
	}

	if strings.TrimSpace(filter.Query) != "" {
		query := strings.TrimSpace(filter.Query)
		q = q.Where(entseries.Or(
			entseries.TitleContainsFold(query),
			entseries.SlugContainsFold(query),
			entseries.SummaryContainsFold(query),
		))
	}

	if filter.IncludeEpisodes {
		q = q.WithEpisodes(func(eq *entgenerated.EpisodeQuery) {
			eq.Where(entepisode.DeletedAtIsNil()).
				Order(entepisode.BySeq())
		})
	}

	rows, err := q.
		Order(entseries.ByCreatedAt(sql.OrderDesc())).
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

	series := lo.Map(rows, func(row *entgenerated.Series, _ int) core.Series {
		return *toDomainSeries(row, filter.IncludeEpisodes)
	})

	return series, nextToken, nil
}

// CreateSeries persists a new series with optional initial episodes.
func (r *SeriesRepository) CreateSeries(ctx context.Context, series core.Series) (*core.Series, error) {
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return nil, err
	}

	builder := tx.Series.Create().
		SetID(series.ID).
		SetSlug(series.Slug).
		SetTitle(series.Title).
		SetSummary(series.Summary).
		SetLanguage(series.Language).
		SetLevel(series.Level).
		SetStatus(int(series.Status)).
		SetCoverURL(series.CoverURL).
		SetEpisodeCount(series.EpisodeCount).
		SetCreatedAt(series.CreatedAt).
		SetUpdatedAt(series.UpdatedAt).
		SetAuthorIds(series.AuthorIDs)

	if len(series.Tags) > 0 {
		builder.SetTags(series.Tags)
	} else {
		builder.SetTags(nil)
	}

	if series.PublishedAt != nil {
		builder.SetPublishedAt(*series.PublishedAt)
	}

	if _, err := builder.Save(ctx); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	for _, episode := range series.Episodes {
		if err := saveEpisodeFromDomain(ctx, tx.Episode.Create(), series.ID, episode); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}

	if err := recalcSeriesEpisodeCount(ctx, tx.Episode, tx.Series, series.ID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetSeries(ctx, series.ID, core.SeriesQueryOptions{
		IncludeEpisodes: len(series.Episodes) > 0,
		IncludeMetadata: true,
	})
}

// GetSeries fetches a series by id with optional expansions.
func (r *SeriesRepository) GetSeries(ctx context.Context, id uuid.UUID, opts core.SeriesQueryOptions) (*core.Series, error) {
	row, err := r.seriesQuery(opts).
		Where(entseries.IDEQ(id)).
		Only(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainSeries(row, opts.IncludeEpisodes), nil
}

// UpdateSeries mutates an existing series record.
func (r *SeriesRepository) UpdateSeries(ctx context.Context, series core.Series) (*core.Series, error) {
	builder := r.client.Series.UpdateOneID(series.ID).
		SetSlug(series.Slug).
		SetTitle(series.Title).
		SetSummary(series.Summary).
		SetLanguage(series.Language).
		SetLevel(series.Level).
		SetStatus(int(series.Status)).
		SetCoverURL(series.CoverURL).
		SetEpisodeCount(series.EpisodeCount).
		SetUpdatedAt(series.UpdatedAt).
		SetAuthorIds(series.AuthorIDs)

	if len(series.Tags) > 0 {
		builder.SetTags(series.Tags)
	} else {
		builder.SetTags(nil)
	}

	if series.PublishedAt != nil {
		builder.SetPublishedAt(*series.PublishedAt)
	} else {
		builder.ClearPublishedAt()
	}

	row, err := builder.Save(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainSeries(row, false), nil
}

// CreateEpisode inserts a new episode for a series.
func (r *SeriesRepository) CreateEpisode(ctx context.Context, episode core.Episode) (*core.Episode, error) {
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return nil, err
	}

	if err := saveEpisodeFromDomain(ctx, tx.Episode.Create(), episode.SeriesID, episode); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := recalcSeriesEpisodeCount(ctx, tx.Episode, tx.Series, episode.SeriesID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetEpisode(ctx, episode.ID)
}

// GetEpisode fetches an episode by id.
func (r *SeriesRepository) GetEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	row, err := r.client.Episode.Get(ctx, id)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}
	return toDomainEpisode(row), nil
}

// UpdateEpisode mutates an existing episode.
func (r *SeriesRepository) UpdateEpisode(ctx context.Context, episode core.Episode) (*core.Episode, error) {
	row, err := applyEpisodeUpdate(r.client.Episode.UpdateOneID(episode.ID), episode).Save(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	if err := r.updateSeriesCountIfNeeded(ctx, episode.SeriesID); err != nil {
		return nil, err
	}

	return toDomainEpisode(row), nil
}

// DeleteEpisode performs a soft delete on an episode.
func (r *SeriesRepository) DeleteEpisode(ctx context.Context, id uuid.UUID) (*core.Episode, error) {
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := tx.Episode.Get(ctx, id)
	if err != nil {
		_ = tx.Rollback()
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	if existing.DeletedAt != nil {
		_ = tx.Rollback()
		return toDomainEpisode(existing), nil
	}

	now := time.Now().UTC()
	row, err := tx.Episode.UpdateOneID(id).
		SetStatus(int(core.EpisodeStatusArchived)).
		SetDeletedAt(now).
		SetUpdatedAt(now).
		Save(ctx)
	if err != nil {
		_ = tx.Rollback()
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	if err := recalcSeriesEpisodeCount(ctx, tx.Episode, tx.Series, existing.SeriesID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return toDomainEpisode(row), nil
}

func (r *SeriesRepository) seriesQuery(opts core.SeriesQueryOptions) *entgenerated.SeriesQuery {
	q := r.client.Series.Query()
	if opts.IncludeEpisodes {
		q = q.WithEpisodes(func(eq *entgenerated.EpisodeQuery) {
			eq.Where(entepisode.DeletedAtIsNil()).
				Order(entepisode.BySeq())
		})
	}
	return q
}

func (r *SeriesRepository) updateSeriesCountIfNeeded(ctx context.Context, seriesID uuid.UUID) error {
	if seriesID == uuid.Nil {
		return nil
	}
	return recalcSeriesEpisodeCount(ctx, r.client.Episode, r.client.Series, seriesID)
}

func saveEpisodeFromDomain(ctx context.Context, builder *entgenerated.EpisodeCreate, seriesID uuid.UUID, episode core.Episode) error {
	builder = builder.
		SetID(episode.ID).
		SetSeriesID(seriesID)
	builder = applyEpisodeCreate(builder, episode)

	_, err := builder.Save(ctx)
	if entgenerated.IsNotFound(err) {
		return core.ErrNotFound
	}
	return err
}

func applyEpisodeCreate(builder *entgenerated.EpisodeCreate, episode core.Episode) *entgenerated.EpisodeCreate {
	builder = builder.
		SetSeq(episode.Seq).
		SetTitle(episode.Title).
		SetDescription(episode.Description).
		SetDurationSeconds(int(episode.Duration / time.Second)).
		SetStatus(int(episode.Status)).
		SetResourceType(int(episode.Resource.Type)).
		SetResourcePlaybackURL(episode.Resource.PlaybackURL).
		SetResourceMimeType(episode.Resource.MimeType).
		SetTranscriptLanguage(episode.Transcript.Language).
		SetTranscriptFormat(int(episode.Transcript.Format)).
		SetTranscriptContent(episode.Transcript.Content).
		SetCreatedAt(episode.CreatedAt).
		SetUpdatedAt(episode.UpdatedAt)

	if episode.Resource.AssetID != uuid.Nil {
		builder.SetResourceAssetID(episode.Resource.AssetID)
	}

	if episode.PublishedAt != nil {
		builder.SetPublishedAt(*episode.PublishedAt)
	}

	if episode.DeletedAt != nil {
		builder.SetDeletedAt(*episode.DeletedAt)
	}

	return builder
}

func applyEpisodeUpdate(builder *entgenerated.EpisodeUpdateOne, episode core.Episode) *entgenerated.EpisodeUpdateOne {
	builder = builder.
		SetSeq(episode.Seq).
		SetTitle(episode.Title).
		SetDescription(episode.Description).
		SetDurationSeconds(int(episode.Duration / time.Second)).
		SetStatus(int(episode.Status)).
		SetResourceType(int(episode.Resource.Type)).
		SetResourcePlaybackURL(episode.Resource.PlaybackURL).
		SetResourceMimeType(episode.Resource.MimeType).
		SetTranscriptLanguage(episode.Transcript.Language).
		SetTranscriptFormat(int(episode.Transcript.Format)).
		SetTranscriptContent(episode.Transcript.Content).
		SetUpdatedAt(episode.UpdatedAt)

	if episode.Resource.AssetID != uuid.Nil {
		builder.SetResourceAssetID(episode.Resource.AssetID)
	} else {
		builder.ClearResourceAssetID()
	}

	if episode.PublishedAt != nil {
		builder.SetPublishedAt(*episode.PublishedAt)
	} else {
		builder.ClearPublishedAt()
	}

	if episode.DeletedAt != nil {
		builder.SetDeletedAt(*episode.DeletedAt)
	} else {
		builder.ClearDeletedAt()
	}

	return builder
}

func recalcSeriesEpisodeCount(ctx context.Context, episodeClient *entgenerated.EpisodeClient, seriesClient *entgenerated.SeriesClient, seriesID uuid.UUID) error {
	count, err := episodeClient.Query().
		Where(
			entepisode.SeriesIDEQ(seriesID),
			entepisode.DeletedAtIsNil(),
		).
		Count(ctx)
	if err != nil {
		return err
	}

	return seriesClient.UpdateOneID(seriesID).
		SetEpisodeCount(count).
		SetUpdatedAt(time.Now().UTC()).
		Exec(ctx)
}

func toDomainSeries(row *entgenerated.Series, includeEpisodes bool) *core.Series {
	if row == nil {
		return nil
	}

	tags := lo.Map(row.Tags, func(tag string, _ int) string { return tag })
	authorIDs := lo.Map(row.AuthorIds, func(id string, _ int) string { return id })

	series := &core.Series{
		ID:           row.ID,
		Slug:         row.Slug,
		Title:        row.Title,
		Summary:      row.Summary,
		Language:     row.Language,
		Level:        row.Level,
		Tags:         lo.Ternary(len(tags) > 0, tags, []string(nil)),
		CoverURL:     row.CoverURL,
		Status:       core.SeriesStatus(row.Status),
		EpisodeCount: row.EpisodeCount,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
		AuthorIDs:    lo.Ternary(len(authorIDs) > 0, authorIDs, []string(nil)),
	}

	if row.PublishedAt != nil {
		t := *row.PublishedAt
		series.PublishedAt = &t
	}

	if includeEpisodes && row.Edges.Episodes != nil {
		series.Episodes = lo.Map(row.Edges.Episodes, func(ep *entgenerated.Episode, _ int) core.Episode {
			return *toDomainEpisode(ep)
		})
	}

	return series
}

func toDomainEpisode(row *entgenerated.Episode) *core.Episode {
	if row == nil {
		return nil
	}

	episode := &core.Episode{
		ID:          row.ID,
		SeriesID:    row.SeriesID,
		Seq:         row.Seq,
		Title:       row.Title,
		Description: row.Description,
		Duration:    time.Duration(row.DurationSeconds) * time.Second,
		Status:      core.EpisodeStatus(row.Status),
		Resource: core.MediaResource{
			Type:        core.MediaType(row.ResourceType),
			PlaybackURL: row.ResourcePlaybackURL,
			MimeType:    row.ResourceMimeType,
		},
		Transcript: core.Transcript{
			Language: row.TranscriptLanguage,
			Format:   core.TranscriptFormat(row.TranscriptFormat),
			Content:  row.TranscriptContent,
		},
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}

	if row.ResourceAssetID != nil {
		episode.Resource.AssetID = *row.ResourceAssetID
	}

	if row.PublishedAt != nil {
		t := *row.PublishedAt
		episode.PublishedAt = &t
	}

	if row.DeletedAt != nil {
		t := *row.DeletedAt
		episode.DeletedAt = &t
	}

	return episode
}

func parseOffsetToken(token string) (int, error) {
	if strings.TrimSpace(token) == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(token)
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("%w: %q", core.ErrInvalidPageToken, token)
	}
	return offset, nil
}
