package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// Series holds the schema definition for the Series entity.
type Series struct {
	ent.Schema
}

// Fields of the Series.
func (Series) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			Unique(),
		field.String("slug").
			Unique(),
		field.String("title"),
		field.String("summary").
			Default(""),
		field.String("language").
			Default(""),
		field.String("level").
			Default(""),
		field.Strings("tags").
			Optional(),
		field.String("cover_url").
			Default(""),
		field.Int("status").
			Default(0),
		field.Int("episode_count").
			Default(0),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
		field.Time("published_at").
			Optional().
			Nillable(),
		field.Strings("author_ids").
			Optional(),
	}
}

// Edges of the Series.
func (Series) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("episodes", Episode.Type),
	}
}
