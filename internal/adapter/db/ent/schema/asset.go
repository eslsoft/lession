package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// Asset holds the schema definition for the Asset entity.
type Asset struct {
	ent.Schema
}

// Fields of the Asset.
func (Asset) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			Unique(),
		field.String("asset_key").
			Unique(),
		field.Int("type").
			Default(0),
		field.Int("status").
			Default(0),
		field.String("original_filename"),
		field.String("mime_type"),
		field.Int64("filesize").
			Default(0),
		field.Int("duration_seconds").
			Default(0),
		field.String("playback_url").
			Optional(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
		field.Time("ready_at").
			Optional().
			Nillable(),
	}
}

// Edges of the Asset.
func (Asset) Edges() []ent.Edge {
	return nil
}
