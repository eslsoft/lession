package core

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Lesson represents a domain object describing a course lesson.
type Lesson struct {
	ID              uuid.UUID
	Title           string
	Description     *string
	Teacher         *string
	DurationMinutes int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// CreateLessonParams holds the input required to create a lesson.
type CreateLessonParams struct {
	Title           string
	Description     *string
	Teacher         *string
	DurationMinutes int
}

// UpdateLessonParams holds the input required to update an existing lesson.
type UpdateLessonParams struct {
	ID              uuid.UUID
	Title           string
	Description     *string
	Teacher         *string
	DurationMinutes int
}

// LessonRepository defines the persistence operations required by the lesson domain.
type LessonRepository interface {
	Create(ctx context.Context, params CreateLessonParams) (*Lesson, error)
	Get(ctx context.Context, id uuid.UUID) (*Lesson, error)
	List(ctx context.Context, limit, offset int) ([]Lesson, error)
	Update(ctx context.Context, params UpdateLessonParams) (*Lesson, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// LessonService exposes the lesson use cases to the transport layer.
type LessonService interface {
	CreateLesson(ctx context.Context, params CreateLessonParams) (*Lesson, error)
	GetLesson(ctx context.Context, id uuid.UUID) (*Lesson, error)
	ListLessons(ctx context.Context, pageSize int, pageToken string) ([]Lesson, string, error)
	UpdateLesson(ctx context.Context, params UpdateLessonParams) (*Lesson, error)
	DeleteLesson(ctx context.Context, id uuid.UUID) error
}

var (
	ErrNotFound         = errors.New("lesson not found")
	ErrInvalidPageToken = errors.New("invalid page token")
	ErrValidation       = errors.New("validation error")
)
