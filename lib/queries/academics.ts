"use client";
// 과목·코스·로드맵 도메인 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { invalidateCourseAggregate } from "@/lib/query-cache";
import { CATALOG_STALE, detailRetry, useInvalidator } from "./shared";

export const useSubjects = () => useQuery({ queryKey: qk.subjects.list(), queryFn: () => api.subjects.list(), staleTime: CATALOG_STALE });
export const useCourses = () => useQuery({ queryKey: qk.courses.list(), queryFn: () => api.courses.list(), staleTime: CATALOG_STALE });

export const useCourse = (id: number | null) =>
  useQuery({ queryKey: qk.courses.detail(id ?? 0), queryFn: () => api.courses.get(id as number), enabled: id != null, retry: detailRetry });
// [TBO-47 2026-07-23] 로드맵 — aggregate 목록·상세(코스 조인은 서버 파생, 화면 자체 조인 금지).
export const useRoadmaps = () => useQuery({ queryKey: qk.roadmaps.list(), queryFn: () => api.roadmaps.list(), staleTime: CATALOG_STALE });
export const useRoadmap = (id: number | null) =>
  useQuery({ queryKey: qk.roadmaps.detail(id ?? 0), queryFn: () => api.roadmaps.get(id as number), enabled: id != null, retry: detailRetry });

// 카탈로그
export const useCreateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.courses.create, onSuccess: () => invalidateCourseAggregate(queryClient) });
};
export const useCreateSubject = () => useMutation({ mutationFn: api.subjects.create, onSuccess: useInvalidator([qk.subjects.all]) });
export const useUpdateCourse = () =>
  {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.courses.update>[1] }) => api.courses.update(v.id, v.patch), onSuccess: () => invalidateCourseAggregate(queryClient) });
  };
export const useRemoveCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.courses.remove, onSuccess: () => invalidateCourseAggregate(queryClient) });
};
export const useUpdateSubject = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.subjects.update>[1] }) => api.subjects.update(v.id, v.patch), onSuccess: useInvalidator([qk.subjects.all]) });
export const useRemoveSubject = () => useMutation({ mutationFn: api.subjects.remove, onSuccess: useInvalidator([qk.subjects.all]) });
// [TBO-47 2026-07-23] 로드맵 쓰기 — 전부 qk.roadmaps 루트 무효화(목록·상세 동시 갱신, 인라인 useMutation 금지 규약).
export const useCreateRoadmap = () => useMutation({ mutationFn: api.roadmaps.create, onSuccess: useInvalidator([qk.roadmaps.all]) });
export const useUpdateRoadmap = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.roadmaps.update>[1] }) => api.roadmaps.update(v.id, v.patch), onSuccess: useInvalidator([qk.roadmaps.all]) });
export const useRemoveRoadmap = () => useMutation({ mutationFn: api.roadmaps.remove, onSuccess: useInvalidator([qk.roadmaps.all]) });
export const useAddRoadmapCourse = () =>
  useMutation({ mutationFn: (v: { id: number; courseId: number }) => api.roadmaps.addCourse(v.id, v.courseId), onSuccess: useInvalidator([qk.roadmaps.all]) });
export const useRemoveRoadmapCourse = () =>
  useMutation({ mutationFn: (v: { id: number; courseId: number }) => api.roadmaps.removeCourse(v.id, v.courseId), onSuccess: useInvalidator([qk.roadmaps.all]) });
export const useReorderRoadmapCourses = () =>
  useMutation({ mutationFn: (v: { id: number; courseIds: number[] }) => api.roadmaps.reorderCourses(v.id, v.courseIds), onSuccess: useInvalidator([qk.roadmaps.all]) });
