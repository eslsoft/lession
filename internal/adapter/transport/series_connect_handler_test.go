package transport

import (
	"testing"
	"time"

	"github.com/google/uuid"
	durationpb "google.golang.org/protobuf/types/known/durationpb"
	fieldmaskpb "google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/eslsoft/lession/internal/core"
	lessionv1 "github.com/eslsoft/lession/pkg/api/lession/v1"
)

func TestApplySeriesFieldMask(t *testing.T) {
	target := &core.Series{
		Slug:      "old-slug",
		Title:     "Old Title",
		Summary:   "old summary",
		Language:  "en",
		Level:     "beginner",
		Tags:      []string{"a"},
		CoverURL:  "cover.png",
		Status:    core.SeriesStatusDraft,
		AuthorIDs: []string{"one"},
	}

	patch := &lessionv1.SeriesDraft{
		Slug:      "new-slug",
		Title:     "New Title",
		Summary:   "new summary",
		Language:  "fr",
		Level:     "advanced",
		Tags:      []string{"b", "c"},
		CoverUrl:  "cover-new.png",
		Status:    lessionv1.SeriesStatus_SERIES_STATUS_PUBLISHED,
		AuthorIds: []string{"two", "three"},
	}

	mask := &fieldmaskpb.FieldMask{
		Paths: []string{"slug", "title", "summary", "language", "level", "tags", "cover_url", "status", "author_ids"},
	}

	if err := applySeriesFieldMask(target, patch, mask); err != nil {
		t.Fatalf("applySeriesFieldMask() error = %v", err)
	}

	if target.Slug != "new-slug" || target.Title != "New Title" || target.Language != "fr" {
		t.Fatalf("series fields were not updated correctly: %#v", target)
	}
	if target.Status != core.SeriesStatusPublished {
		t.Fatalf("expected status published, got %v", target.Status)
	}
	if len(target.Tags) != 2 || target.Tags[0] != "b" {
		t.Fatalf("expected tags updated, got %#v", target.Tags)
	}
	if len(target.AuthorIDs) != 2 || target.AuthorIDs[1] != "three" {
		t.Fatalf("expected author ids updated, got %#v", target.AuthorIDs)
	}
}

func TestApplyEpisodeFieldMask(t *testing.T) {
	episode := &core.Episode{
		ID:       uuid.New(),
		SeriesID: uuid.New(),
		Seq:      1,
		Title:    "Old",
		Status:   core.EpisodeStatusDraft,
		Resource: core.MediaResource{},
		Transcript: core.Transcript{
			Language: "en",
			Content:  "old",
		},
	}

	assetID := uuid.New()
	patch := &lessionv1.EpisodeDraft{
		Seq:      2,
		Title:    "New",
		Duration: durationpb.New(2 * time.Minute),
		Status:   lessionv1.EpisodeStatus_EPISODE_STATUS_PUBLISHED,
		Resource: &lessionv1.MediaResource{
			AssetId:     assetID.String(),
			Type:        lessionv1.MediaType_MEDIA_TYPE_AUDIO,
			PlaybackUrl: "https://cdn/new.mp3",
			MimeType:    "audio/mpeg",
		},
		Transcript: &lessionv1.Transcript{
			Language: "fr",
			Format:   lessionv1.TranscriptFormat_TRANSCRIPT_FORMAT_PLAIN,
			Content:  "bonjour",
		},
	}

	mask := &fieldmaskpb.FieldMask{
		Paths: []string{
			"seq",
			"title",
			"duration",
			"status",
			"resource.asset_id",
			"resource.type",
			"resource.playback_url",
			"resource.mime_type",
			"transcript.language",
			"transcript.format",
			"transcript.content",
		},
	}

	if err := applyEpisodeFieldMask(episode, patch, mask); err != nil {
		t.Fatalf("applyEpisodeFieldMask() error = %v", err)
	}

	if episode.Seq != 2 || episode.Title != "New" {
		t.Fatalf("episode basic fields not updated: %#v", episode)
	}
	if episode.Duration != 2*time.Minute {
		t.Fatalf("expected duration updated, got %v", episode.Duration)
	}
	if episode.Status != core.EpisodeStatusPublished {
		t.Fatalf("expected status published, got %v", episode.Status)
	}
	if episode.Resource.AssetID != assetID || episode.Resource.PlaybackURL != "https://cdn/new.mp3" {
		t.Fatalf("resource not updated: %#v", episode.Resource)
	}
	if episode.Transcript.Language != "fr" || episode.Transcript.Content != "bonjour" {
		t.Fatalf("transcript not updated: %#v", episode.Transcript)
	}
}

func TestFromProtoSeriesDraft(t *testing.T) {
	assetID := uuid.New()
	draft := &lessionv1.SeriesDraft{
		Slug:   "slug",
		Title:  "title",
		Status: lessionv1.SeriesStatus_SERIES_STATUS_DRAFT,
		Episodes: []*lessionv1.EpisodeDraft{
			{
				Seq:      1,
				Title:    "ep1",
				Status:   lessionv1.EpisodeStatus_EPISODE_STATUS_READY,
				Duration: durationpb.New(time.Minute),
				Resource: &lessionv1.MediaResource{
					AssetId: assetID.String(),
					Type:    lessionv1.MediaType_MEDIA_TYPE_AUDIO,
				},
			},
		},
	}

	got, err := fromProtoSeriesDraft(draft)
	if err != nil {
		t.Fatalf("fromProtoSeriesDraft() error = %v", err)
	}
	if got.Slug != "slug" || len(got.Episodes) != 1 {
		t.Fatalf("unexpected series draft: %#v", got)
	}
	if got.Episodes[0].Resource == nil || got.Episodes[0].Resource.AssetID != assetID {
		t.Fatalf("expected episode resource converted, got %#v", got.Episodes[0].Resource)
	}
	if got.Episodes[0].Duration != time.Minute {
		t.Fatalf("expected duration 1m, got %v", got.Episodes[0].Duration)
	}
}
