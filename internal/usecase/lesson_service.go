package usecase

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"github.com/eslsoft/lession/internal/core"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// LessonService coordinates lesson use cases and aggregates domain logic.
type LessonService struct {
	repo core.LessonRepository
}

// NewLessonService constructs a lesson service backed by the provided repository.
func NewLessonService(repo core.LessonRepository) *LessonService {
	return &LessonService{repo: repo}
}

var _ core.LessonService = (*LessonService)(nil)

// CreateLesson creates a new lesson using the underlying repository.
func (s *LessonService) CreateLesson(ctx context.Context, params core.CreateLessonParams) (*core.Lesson, error) {
	if params.Title == "" {
		return nil, fmt.Errorf("%w: title is required", core.ErrValidation)
	}

	return s.repo.Create(ctx, params)
}

// GetLesson fetches a lesson by its identifier.
func (s *LessonService) GetLesson(ctx context.Context, id uuid.UUID) (*core.Lesson, error) {
	return s.repo.Get(ctx, id)
}

// ListLessons returns a page of lessons along with the next page token if available.
func (s *LessonService) ListLessons(ctx context.Context, pageSize int, pageToken string) ([]core.Lesson, string, error) {
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	offset, err := parsePageToken(pageToken)
	if err != nil {
		return nil, "", err
	}

	lessons, err := s.repo.List(ctx, pageSize+1, offset)
	if err != nil {
		return nil, "", err
	}

	var nextToken string
	if len(lessons) > pageSize {
		lessons = lessons[:pageSize]
		nextToken = strconv.Itoa(offset + pageSize)
	}

	return lessons, nextToken, nil
}

// UpdateLesson updates an existing lesson.
func (s *LessonService) UpdateLesson(ctx context.Context, params core.UpdateLessonParams) (*core.Lesson, error) {
	if params.Title == "" {
		return nil, fmt.Errorf("%w: title is required", core.ErrValidation)
	}

	return s.repo.Update(ctx, params)
}

// DeleteLesson removes a lesson by id.
func (s *LessonService) DeleteLesson(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

func parsePageToken(token string) (int, error) {
	if token == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(token)
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("%w: %q", core.ErrInvalidPageToken, token)
	}
	return offset, nil
}
