package transport

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"

	"github.com/eslsoft/lession/internal/core"
	lessonv1 "github.com/eslsoft/lession/pkg/api/lesson/v1"
	"github.com/eslsoft/lession/pkg/api/lesson/v1/lessonv1connect"
)

// LessonHandler implements the generated Connect service.
type LessonHandler struct {
	service core.LessonService
}

// NewLessonHandler builds a new Connect lesson handler.
func NewLessonHandler(service core.LessonService) *LessonHandler {
	return &LessonHandler{service: service}
}

var _ lessonv1connect.LessonServiceHandler = (*LessonHandler)(nil)

func (h *LessonHandler) CreateLesson(ctx context.Context, req *connect.Request[lessonv1.CreateLessonRequest]) (*connect.Response[lessonv1.CreateLessonResponse], error) {
	params := core.CreateLessonParams{
		Title:           req.Msg.GetTitle(),
		Description:     req.Msg.Description,
		Teacher:         req.Msg.Teacher,
		DurationMinutes: int(req.Msg.GetDurationMinutes()),
	}

	lesson, err := h.service.CreateLesson(ctx, params)
	if err != nil {
		return nil, toConnectError(err)
	}

	res := connect.NewResponse(&lessonv1.CreateLessonResponse{Lesson: toProtoLesson(lesson)})
	return res, nil
}

func (h *LessonHandler) GetLesson(ctx context.Context, req *connect.Request[lessonv1.GetLessonRequest]) (*connect.Response[lessonv1.GetLessonResponse], error) {
	id, err := uuid.Parse(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	lesson, err := h.service.GetLesson(ctx, id)
	if err != nil {
		return nil, toConnectError(err)
	}

	res := connect.NewResponse(&lessonv1.GetLessonResponse{Lesson: toProtoLesson(lesson)})
	return res, nil
}

func (h *LessonHandler) ListLessons(ctx context.Context, req *connect.Request[lessonv1.ListLessonsRequest]) (*connect.Response[lessonv1.ListLessonsResponse], error) {
	lessons, nextToken, err := h.service.ListLessons(ctx, int(req.Msg.GetPageSize()), req.Msg.GetPageToken())
	if err != nil {
		return nil, toConnectError(err)
	}

	protoLessons := make([]*lessonv1.Lesson, 0, len(lessons))
	for i := range lessons {
		protoLessons = append(protoLessons, toProtoLesson(&lessons[i]))
	}

	res := connect.NewResponse(&lessonv1.ListLessonsResponse{
		Lessons:       protoLessons,
		NextPageToken: nextToken,
	})
	return res, nil
}

func (h *LessonHandler) UpdateLesson(ctx context.Context, req *connect.Request[lessonv1.UpdateLessonRequest]) (*connect.Response[lessonv1.UpdateLessonResponse], error) {
	id, err := uuid.Parse(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	params := core.UpdateLessonParams{
		ID:              id,
		Title:           req.Msg.GetTitle(),
		Description:     req.Msg.Description,
		Teacher:         req.Msg.Teacher,
		DurationMinutes: int(req.Msg.GetDurationMinutes()),
	}

	lesson, err := h.service.UpdateLesson(ctx, params)
	if err != nil {
		return nil, toConnectError(err)
	}

	res := connect.NewResponse(&lessonv1.UpdateLessonResponse{Lesson: toProtoLesson(lesson)})
	return res, nil
}

func (h *LessonHandler) DeleteLesson(ctx context.Context, req *connect.Request[lessonv1.DeleteLessonRequest]) (*connect.Response[lessonv1.DeleteLessonResponse], error) {
	id, err := uuid.Parse(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := h.service.DeleteLesson(ctx, id); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&lessonv1.DeleteLessonResponse{}), nil
}

func toProtoLesson(lesson *core.Lesson) *lessonv1.Lesson {
	if lesson == nil {
		return nil
	}

	protoLesson := &lessonv1.Lesson{
		Id:              lesson.ID.String(),
		Title:           lesson.Title,
		DurationMinutes: int32(lesson.DurationMinutes),
		CreatedAt:       timestamppb.New(lesson.CreatedAt),
		UpdatedAt:       timestamppb.New(lesson.UpdatedAt),
	}

	if lesson.Description != nil {
		protoLesson.Description = lesson.Description
	}

	if lesson.Teacher != nil {
		protoLesson.Teacher = lesson.Teacher
	}

	return protoLesson
}

func toConnectError(err error) error {
	if err == nil {
		return nil
	}

	switch {
	case errors.Is(err, core.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, core.ErrInvalidPageToken):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, core.ErrValidation):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
