package db

import (
	"context"

	"github.com/google/uuid"

	entgenerated "github.com/eslsoft/lession/internal/adapter/db/ent/generated"
	entlesson "github.com/eslsoft/lession/internal/adapter/db/ent/generated/lesson"
	"github.com/eslsoft/lession/internal/core"
)

// LessonRepository persists lessons using Ent.
type LessonRepository struct {
	client *entgenerated.Client
}

// NewLessonRepository constructs an Ent-backed lesson repository.
func NewLessonRepository(client *entgenerated.Client) *LessonRepository {
	return &LessonRepository{client: client}
}

var _ core.LessonRepository = (*LessonRepository)(nil)

// Create inserts a new lesson record.
func (r *LessonRepository) Create(ctx context.Context, params core.CreateLessonParams) (*core.Lesson, error) {
	builder := r.client.Lesson.Create().
		SetTitle(params.Title).
		SetDurationMinutes(params.DurationMinutes)

	builder.SetNillableDescription(params.Description)
	builder.SetNillableTeacher(params.Teacher)

	created, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}

	return toDomain(created), nil
}

// Get fetches a lesson by id.
func (r *LessonRepository) Get(ctx context.Context, id uuid.UUID) (*core.Lesson, error) {
	row, err := r.client.Lesson.Get(ctx, id)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	return toDomain(row), nil
}

// List returns lessons with the supplied window parameters.
func (r *LessonRepository) List(ctx context.Context, limit, offset int) ([]core.Lesson, error) {
	rows, err := r.client.Lesson.Query().
		Order(entgenerated.Desc(entlesson.FieldCreatedAt)).
		Limit(limit).
		Offset(offset).
		All(ctx)
	if err != nil {
		return nil, err
	}

	lessons := make([]core.Lesson, 0, len(rows))
	for _, row := range rows {
		lessons = append(lessons, *toDomain(row))
	}

	return lessons, nil
}

// Update overwrites the lesson attributes.
func (r *LessonRepository) Update(ctx context.Context, params core.UpdateLessonParams) (*core.Lesson, error) {
	builder := r.client.Lesson.UpdateOneID(params.ID).
		SetTitle(params.Title).
		SetDurationMinutes(params.DurationMinutes)

	builder.SetNillableDescription(params.Description)
	builder.SetNillableTeacher(params.Teacher)

	updated, err := builder.Save(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return nil, core.ErrNotFound
		}
		return nil, err
	}

	return toDomain(updated), nil
}

// Delete removes a lesson by id.
func (r *LessonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := r.client.Lesson.DeleteOneID(id).Exec(ctx)
	if err != nil {
		if entgenerated.IsNotFound(err) {
			return core.ErrNotFound
		}
		return err
	}

	return nil
}

func toDomain(row *entgenerated.Lesson) *core.Lesson {
	if row == nil {
		return nil
	}

	lesson := &core.Lesson{
		ID:              row.ID,
		Title:           row.Title,
		DurationMinutes: row.DurationMinutes,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}

	if row.Description != nil {
		lesson.Description = row.Description
	}

	if row.Teacher != nil {
		lesson.Teacher = row.Teacher
	}

	return lesson
}
