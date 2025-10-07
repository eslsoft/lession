package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// UploadSession holds the schema definition for the UploadSession entity.
type UploadSession struct {
	ent.Schema
}

// Fields of the UploadSession.
func (UploadSession) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			Unique(),
		field.String("asset_key").
			Unique(),
		field.Int("type").
			Default(0),
		field.Int("protocol").
			Default(0),
		field.Int("status").
			Default(0),
		field.String("target_method"),
		field.String("target_url"),
		field.JSON("target_headers", map[string]string{}).
			Optional().
			Default(func() map[string]string { return map[string]string{} }),
		field.JSON("target_form_fields", map[string]string{}).
			Optional().
			Default(func() map[string]string { return map[string]string{} }),
		field.String("original_filename"),
		field.String("mime_type"),
		field.Int64("content_length").
			Default(0),
		field.Time("expires_at"),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the UploadSession.
func (UploadSession) Edges() []ent.Edge {
	return nil
}
