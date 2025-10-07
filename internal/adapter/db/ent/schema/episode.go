package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// Episode holds the schema definition for the Episode entity.
type Episode struct {
	ent.Schema
}

// Fields of the Episode.
func (Episode) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			Unique(),
		field.UUID("series_id", uuid.UUID{}),
		field.Uint32("seq"),
		field.String("title"),
		field.String("description").
			Default(""),
		field.Int("duration_seconds").
			Default(0),
		field.Int("status").
			Default(0),
		field.UUID("resource_asset_id", uuid.UUID{}).
			Optional().
			Nillable(),
		field.Int("resource_type").
			Default(0),
		field.String("resource_playback_url").
			Default(""),
		field.String("resource_mime_type").
			Default(""),
		field.String("transcript_language").
			Default(""),
		field.Int("transcript_format").
			Default(0),
		field.Text("transcript_content").
			Default(""),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
		field.Time("published_at").
			Optional().
			Nillable(),
		field.Time("deleted_at").
			Optional().
			Nillable(),
	}
}

// Edges of the Episode.
func (Episode) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("series", Series.Type).
			Ref("episodes").
			Field("series_id").
			Unique().
			Required(),
	}
}

// Indexes of the Episode.
func (Episode) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("series_id", "seq").
			Unique(),
		index.Fields("series_id"),
	}
}
