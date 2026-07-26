// 코스·과목·로드맵·강사(프로필/계약) 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type {
  Course,
  Subject,
  CreateCourseInput,
  CreateSubjectInput,
  Roadmap,
  CreateRoadmapInput,
  InstructorAggregate,
  CreateInstructorInput,
  UpdateInstructorInput,
} from "@kms545487/contracts";

// [TBO-47 2026-07-23] 로드맵 aggregate — BE RoadmapsService.toAggregate 미러(코스명은 courses SSOT 조인 파생, 사본 저장 0).
export type RoadmapAggregate = Roadmap & {
  courses: Array<{ linkId: number; courseId: number; sortOrder: number; courseName: string; subjectId: number }>;
};
// 계약(CreateRoadmapInput) + BE 운영 필드(durationWeeks) — 수정은 courseIds 제외(연결은 전용 라우트).
//  수정에서 null = 값 해제(대상 학년 '전체'로 등) — BE @IsOptional이 null 통과 → store가 NULL 저장.
export type CreateRoadmapBody = CreateRoadmapInput & { durationWeeks?: number };
export type UpdateRoadmapInput = {
  title?: string; description?: string; targetGrade?: number | null; durationWeeks?: number | null; isActive?: boolean;
};
// [TBO-19 Sprint4] 강사 계약(백엔드 로컬 타입 — @kms545487/contracts 미포함). DB 이관 시 contracts로 승격 검토.
export type InstructorContract = {
  id: number; instructorId: number; monthlyHours: number; hourlyRate: number;
  periodStart: string; periodEnd?: string; active: boolean; memo?: string;
  createdAt: string; updatedAt: string;
};

export const academicsApi = {
  courses: {
    list: () => http.get<Course[]>("/courses").then((r) => r.data),
    get: (id: number) => http.get<Course>(`/courses/${id}`).then((r) => r.data), // [B7 E3] 상세 단건
    create: (input: CreateCourseInput) => http.post<Course>("/courses", input).then((r) => r.data),
    update: (id: number, patch: Partial<CreateCourseInput>) => http.patch<Course>(`/courses/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<Course>(`/courses/${id}`).then((r) => r.data),
  },
  subjects: {
    list: () => http.get<Subject[]>("/subjects").then((r) => r.data),
    create: (input: CreateSubjectInput) => http.post<Subject>("/subjects", input).then((r) => r.data),
    update: (id: number, patch: Partial<CreateSubjectInput>) => http.patch<Subject>(`/subjects/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<Subject>(`/subjects/${id}`).then((r) => r.data),
  },
  // [TBO-47 2026-07-23] 수강 로드맵 — 코스 묶음 카탈로그(조회 전 직원·쓰기 매니저 이상).
  //  응답은 전부 RoadmapAggregate(코스 조인 sortOrder 정렬) — 화면 자체 조인 금지(사본 0).
  roadmaps: {
    list: () => http.get<RoadmapAggregate[]>("/roadmaps").then((r) => r.data),
    get: (id: number) => http.get<RoadmapAggregate>(`/roadmaps/${id}`).then((r) => r.data),
    create: (input: CreateRoadmapBody) => http.post<RoadmapAggregate>("/roadmaps", input).then((r) => r.data),
    update: (id: number, patch: UpdateRoadmapInput) => http.patch<RoadmapAggregate>(`/roadmaps/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<{ id: number; deleted: true }>(`/roadmaps/${id}`).then((r) => r.data),
    addCourse: (id: number, courseId: number) => http.post<RoadmapAggregate>(`/roadmaps/${id}/courses`, { courseId }).then((r) => r.data),
    removeCourse: (id: number, courseId: number) => http.delete<RoadmapAggregate>(`/roadmaps/${id}/courses/${courseId}`).then((r) => r.data),
    // 전체 순서 교체 — 부분 목록은 서버가 400(조용한 누락 금지)
    reorderCourses: (id: number, courseIds: number[]) =>
      http.patch<RoadmapAggregate>(`/roadmaps/${id}/courses/reorder`, { courseIds }).then((r) => r.data),
  },
  // [TBO-19 Sprint4] 강사 계약(읽기 전용 — 매니저) — 백엔드 로컬 타입(contracts 미포함)
  instructorContracts: {
    list: () => http.get<InstructorContract[]>("/instructor-contracts").then((r) => r.data),
  },
  instructors: {
    list: () => http.get<InstructorAggregate[]>("/instructors").then((r) => r.data),
    get: (id: number) => http.get<InstructorAggregate>(`/instructors/${id}`).then((r) => r.data),
    create: (input: CreateInstructorInput) =>
      http.post<InstructorAggregate>("/instructors", input).then((r) => r.data),
    update: (id: number, patch: UpdateInstructorInput) =>
      http.patch<InstructorAggregate>(`/instructors/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<{ id: number; deleted: true }>(`/instructors/${id}`).then((r) => r.data),
  },
};
