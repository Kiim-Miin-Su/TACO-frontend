// 스케줄·수업요청·강의실·가용성·출결·이벤트 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http, type ApiReadOptions } from "./client";
import type {
  ScheduleMutationResult,
  ScheduleDeleteResult,
  ClearAttendanceInput,
  UpsertAttendanceInput,
  AcademyEvent,
  CreateEventInput,
  Attendance,
  AttendanceStatus,
  Room,
  AvailabilityBlock,
  AvailabilityOwner,
  AvailabilityKind,
  ScheduleRow,
  ScheduleResources,
  Conflict,
  ScheduleRequest,
  CreateScheduleRequestInput,
  CreateScheduleRequestBulkInput,
  ScheduleRequestBulkResult,
  UpdateScheduleRequestInput,
  ScheduleRequestApprovalOptions as SharedScheduleRequestApprovalOptions,
  ScheduleQuery as SharedScheduleQuery,
  CreateClassSessionInput,
  UpdateClassSessionInput,
  ScheduleDeleteOptions,
  CreateScheduleSeriesCommand,
  ScheduleSeries,
  UpsertAvailabilityInput,
  ConflictCheckInput,
  InstructorAttendanceSummary as SharedInstructorAttendanceSummary,
  SetInstructorAttendanceInput,
  ClearInstructorAttendanceInput,
  OpenClassInput,
  OpenClassSeriesInput,
  OpenClassResult,
  OpenClassSeriesResult,
  CreateHistoricalCompletedSessionInput,
  HistoricalCompletedSessionResult,
} from "@kms545487/contracts";

// 기존 "@/lib/api" import 표면을 보존하되 wire 필드는 contracts 0.2.32만 소유한다.
export type ScheduleQuery = SharedScheduleQuery;
export type AvailabilityKindEx = AvailabilityKind;
export type ScheduleRequestEx = ScheduleRequest;
export type CreateScheduleRequestBody = CreateScheduleRequestInput;
export type CreateScheduleRequestBulkBody = CreateScheduleRequestBulkInput;
export type UpdateScheduleRequestBody = UpdateScheduleRequestInput;
export type ScheduleCreateBody = CreateClassSessionInput;
export type ScheduleSeriesCreateBody = CreateScheduleSeriesCommand;
export type ScheduleSeriesInfo = ScheduleSeries;
export type AvailabilityUpsertBody = UpsertAvailabilityInput;
export type SchedulePatchBody = UpdateClassSessionInput;
export type ScheduleRequestApprovalOptions = SharedScheduleRequestApprovalOptions;
export type InstructorAttendanceSummary = SharedInstructorAttendanceSummary;
export type ConflictCheckBody = ConflictCheckInput;

export const scheduleApi = {
  events: {
    list: () => http.get<AcademyEvent[]>("/events").then((r) => r.data),
    create: (input: CreateEventInput) => http.post<AcademyEvent>("/events", input).then((r) => r.data),
    // [TBO-29D 요구 ⑥] 매니저 이상 — 수정(병합 후 구간 재검증)·소프트 삭제.
    update: (id: number, patch: Partial<CreateEventInput>) => http.patch<AcademyEvent>(`/events/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<AcademyEvent>(`/events/${id}`).then((r) => r.data),
  },
  attendance: {
    list: (options: ApiReadOptions = {}) => http.get<Attendance[]>("/attendance", options).then((r) => r.data),
    upsert: (body: UpsertAttendanceInput) =>
      http.put<Attendance>("/attendance", body).then((r) => r.data),
    clear: (sessionId: number, studentId: number, body: ClearAttendanceInput) =>
      http.delete<{ id: number; sessionId: number; studentId: number; deleted: true }>(
        `/attendance/${sessionId}/${studentId}`,
        { data: body },
      ).then((r) => r.data),
  },
  // ── 스케줄(v5) ──
  schedule: {
    list: (q: ScheduleQuery = {}, options: ApiReadOptions = {}) =>
      http.get<ScheduleRow[]>("/schedule", { ...options, params: q }).then((r) => r.data),
    // [B7 E3] 상세 단건(BE 신설) — 목록과 동일 enriched ScheduleRow. 강사는 본인 세션만(404→403).
    get: (id: number) => http.get<ScheduleRow>(`/schedule/${id}`).then((r) => r.data),
    // 자원 피커(강사·강의실·학생)
    resources: (options: ApiReadOptions = {}) => http.get<ScheduleResources>("/schedule/resources", options).then((r) => r.data),
    // [TBO-19] 강사 출결 현황 집계(관리자 대시보드) — 기간·강사 필터
    instructorAttendanceSummary: (from?: string, to?: string, instructorId?: number) =>
      http.get<InstructorAttendanceSummary>("/schedule/instructor-attendance-summary", { params: { from, to, instructorId } }).then((r) => r.data),
    setInstructorAttendance: (id: number, body: SetInstructorAttendanceInput) =>
      http.put<ScheduleMutationResult<ScheduleRow, Conflict>>(`/schedule/${id}/instructor-attendance`, body).then((r) => r.data),
    clearInstructorAttendance: (id: number, body: ClearInstructorAttendanceInput) =>
      http.delete<ScheduleMutationResult<ScheduleRow, Conflict>>(`/schedule/${id}/instructor-attendance`, { data: body }).then((r) => r.data),
    // [TBO-64 2026-07-24] 회차 가격 책정(정산 연결 전) — null=해제. 매니저 이상.
    setPayAmount: (id: number, amount: number | null) =>
      http.put<{ row: ScheduleRow }>(`/schedule/${id}/pay-amount`, { amount }).then((r) => r.data),
    // [TBO-79 G1] restore 스텁 제거 — 서버는 이 라우트에서 **항상** 409
    //  (SESSION_AGGREGATE_RESTORE_REQUIRED)를 던진다. 성공 모양을 선언한 클라이언트가 남아 있으면
    //  "복구 버튼"이 만들어질 수 있어 지운다. 세션 삭제는 되돌릴 수 없다.
    // 추천→배정·수동 추가 → { row, conflicts }. 충돌 시 409 → force로 재시도.
    create: (body: ScheduleCreateBody) =>
      http.post<{ row: ScheduleRow; conflicts: Conflict[] }>("/schedule", body).then((r) => r.data),
    createHistoricalCompleted: (body: CreateHistoricalCompletedSessionInput) =>
      http.post<HistoricalCompletedSessionResult>("/schedule/historical-completed", body).then((r) => r.data),
    // [TBO-29C C2] 반복 생성 bulk — 서버 발급 series ID + 전체 원자 커밋(중간 실패=전부 롤백).
    createSeries: (body: ScheduleSeriesCreateBody) =>
      http.post<{ series: ScheduleSeriesInfo; rows: ScheduleRow[]; conflicts: Conflict[] }>("/schedule/series", body).then((r) => r.data),
    // [TBO-48] 과목명 → subject/course/enrollment/session을 서버 transaction 한 번으로 개설.
    openClass: (body: OpenClassInput) =>
      http.post<OpenClassResult>("/schedule/open-class", body).then((response) => response.data),
    openClassSeries: (body: OpenClassSeriesInput) =>
      http.post<OpenClassSeriesResult>("/schedule/open-class-series", body).then((response) => response.data),
    // 이동·리사이즈·편집 → { row, conflicts }. 충돌 시 409(서버) → force로 재시도.
    update: (id: number, body: SchedulePatchBody) =>
      http.patch<ScheduleMutationResult<ScheduleRow, Conflict>>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
    // 세션 삭제(soft delete — v9). [TBO-29C C3] scope(this/this_and_following/all) + series CAS 지원.
    remove: (id: number, opts?: ScheduleDeleteOptions) =>
      http.delete<ScheduleDeleteResult>(`/schedule/${id}`, { params: opts }).then((r) => r.data),
  },
  // 강사 수업 요청 → 매니저 승인/반려(TBO-16 #9). 승인=서버가 createSession 재사용(409+force 동일 규약).
  scheduleRequests: {
    list: (status?: ScheduleRequest["status"], options: ApiReadOptions = {}) =>
      http.get<ScheduleRequestEx[]>("/schedule-requests", { ...options, params: status ? { status } : {} }).then((r) => r.data),
    create: (input: CreateScheduleRequestBody) =>
      http.post<{ row: ScheduleRequestEx; conflicts: Conflict[] }>("/schedule-requests", input).then((r) => r.data),
    createBulk: (input: CreateScheduleRequestBulkBody) =>
      http.post<ScheduleRequestBulkResult>("/schedule-requests/bulk", input).then((r) => r.data),
    approve: (id: number, options: ScheduleRequestApprovalOptions = {}) =>
      http.post<{ request: ScheduleRequestEx; conflicts: Conflict[] }>(
        `/schedule-requests/${id}/approve`,
        {},
        { params: options },
      ).then((r) => r.data),
    reject: (id: number, reason: string) => // 사유 필수(Q2)
      http.post<ScheduleRequestEx>(`/schedule-requests/${id}/reject`, { reason }).then((r) => r.data),
    update: (id: number, body: UpdateScheduleRequestBody) => // [C2C-b] pending 수정(관리자)
      http.patch<ScheduleRequestEx>(`/schedule-requests/${id}`, body).then((r) => r.data),
    withdraw: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/schedule-requests/${id}`).then((r) => r.data),
  },
  rooms: {
    list: () => http.get<Room[]>("/rooms").then((r) => r.data),
    // [B4 2026-07-16] 강의실 관리(매니저 이상 — 강사 403). 정원 기본 1명(BE). 세션 배정>정원이면
    //  스케줄 생성이 409 conflicts(type='room_capacity')로 응답한다(lib/domain/conflict-messages 라벨).
    create: (b: { name: string; capacity?: number; color?: string }) => http.post<Room>("/rooms", b).then((r) => r.data),
    update: (id: number, b: { name?: string; capacity?: number; color?: string; isActive?: boolean }) =>
      http.patch<Room>(`/rooms/${id}`, b).then((r) => r.data),
    remove: (id: number) => http.delete<Room>(`/rooms/${id}`).then((r) => r.data),
  },
  availability: {
    list: (ownerType: AvailabilityOwner, ownerId: number) =>
      http
        .get<AvailabilityBlock[]>("/availability", { params: { ownerType, ownerId } })
        .then((r) => r.data),
    // 전체 블록(추천 컨텍스트용 — 학생+강사+강의실 가용/불가 한 번에)
    all: (options: ApiReadOptions = {}) => http.get<AvailabilityBlock[]>("/availability", options).then((r) => r.data),
    // 가용/불가(Block) 생성·수정(id 있으면 수정)
    upsert: (body: AvailabilityUpsertBody) =>
      http.put<AvailabilityBlock>("/availability", body).then((r) => r.data),
    remove: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/availability/${id}`).then((r) => r.data),
  },
};
