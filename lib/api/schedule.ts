// 스케줄·수업요청·강의실·가용성·출결·이벤트 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http, type ApiReadOptions } from "./client";
import type {
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
  SessionKind,
  RecurrenceScope,
  InstructorAttendanceStatus,
  OpenClassInput,
  OpenClassSeriesInput,
  OpenClassResult,
  OpenClassSeriesResult,
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number };
export type AvailabilityKindEx = AvailabilityKind | "online_only";
type ScheduleRequestKindEx = "session_create" | "session_update" | "session_delete" | "availability_upsert" | "availability_delete";
export type ScheduleRequestEx = ScheduleRequest & {
  requestKind?: ScheduleRequestKindEx;
  targetSessionId?: number;
  targetAvailabilityId?: number;
  availabilityOwnerType?: AvailabilityOwner;
  availabilityOwnerId?: number;
  availabilityKind?: AvailabilityKindEx;
  availabilityWeekday?: number;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
  availabilityEffectiveFrom?: string;
  availabilityEffectiveTo?: string;
  impactSessionIds?: number[];
  changeSummary?: string;
  requestReason?: string;
  memo?: string;
  scope?: RecurrenceScope;
  mode?: "in_person" | "online"; // [C2D] 요청 단계 수업방식 보존(contracts src 반영·게시 전 로컬 확장)
  // [C2C-b] 상세 모달 표시용 — BE BaseRow가 항상 내려주는 시각(contracts 0.1.16엔 미표기, 로컬 확장)
  createdAt?: string;
  updatedAt?: string;
};
export type CreateScheduleRequestBody = Partial<CreateScheduleRequestInput> & {
  requestKind?: ScheduleRequestKindEx;
  targetSessionId?: number;
  targetAvailabilityId?: number;
  availabilityOwnerType?: AvailabilityOwner;
  availabilityOwnerId?: number;
  availabilityKind?: AvailabilityKindEx;
  availabilityWeekday?: number;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
  availabilityEffectiveFrom?: string;
  availabilityEffectiveTo?: string;
  requestReason?: string;
  memo?: string;
  scope?: RecurrenceScope;
  mode?: "in_person" | "online"; // [C2D] 요청 payload 수업방식(session_create)
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 불변 필드(requestKind·target·owner) 제외 부분 패치
export type UpdateScheduleRequestBody = {
  courseId?: number; instructorId?: number; roomId?: number;
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  studentIds?: number[]; topic?: string; memo?: string; kind?: SessionKind; mode?: "in_person" | "online";
  requestReason?: string; scope?: RecurrenceScope;
  availabilityKind?: AvailabilityKindEx; availabilityWeekday?: number;
  availabilityStartTime?: string; availabilityEndTime?: string;
  availabilityEffectiveFrom?: string; availabilityEffectiveTo?: string;
};
export type ScheduleCreateBody = {
  courseId: number; instructorId?: number; roomId?: number; sessionDate: string;
  startTime: string; endTime?: string; durationMinutes?: number; topic?: string; memo?: string; color?: string;
  studentIds?: number[]; // 명시 코호트(v0.1.13) — 미지정=코스 활성 수강생 전원(단체=여러 명 선택)
  seriesId?: number; status?: string; force?: boolean;
  kind?: SessionKind; price?: number; // [v0.1.14] 종류(진단고사/상담)·세션 단건 가격
  mode?: "in_person" | "online";
  isPublic?: boolean;
};
// [TBO-29C C2] 반복 생성 bulk command — 단건 loop/클라이언트 seriesId(Date.now()) 폐기.
//  서버가 series ID를 발급하고 날짜/요일/기간/시간/cohort/FK를 전체 정규화·원자 커밋.
export type ScheduleSeriesCreateBody = {
  courseId: number; instructorId?: number; roomId?: number; studentIds?: number[];
  repeat: { kind: "weekly" | "custom"; weekdays: number[]; startsOn: string; endsOn: string };
  startTime: string; endTime?: string; durationMinutes?: number; timeZone?: string;
  topic?: string; memo?: string; color?: string; status?: string;
  kind?: SessionKind; price?: number; mode?: "in_person" | "online"; isPublic?: boolean; force?: boolean;
};
export type ScheduleSeriesInfo = {
  id: number; repeatKind: "weekly" | "custom"; weekdays: number[]; startsOn: string; endsOn: string;
  startTime: string; durationMinutes: number; timeZone: string; version: number; createdBy?: number; updatedBy?: number;
};

export type AvailabilityUpsertBody = {
  id?: number; ownerType: AvailabilityOwner; ownerId: number; kind?: AvailabilityKindEx;
  weekday: number; startTime: string; endTime: string; effectiveFrom?: string; effectiveTo?: string;
};
export type SchedulePatchBody = {
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  roomId?: number; instructorId?: number; courseId?: number; status?: string; topic?: string; memo?: string; color?: string;
  studentIds?: number[];
  kind?: SessionKind; price?: number; // [v0.1.14] 종류·세션 단건 가격
  instructorAttendance?: InstructorAttendanceStatus; // [TBO-19] 강사 출결(매니저 CRUD) — BE PATCH 수용, manager+ 게이트
  clearInstructorAttendance?: boolean; // [TBO-19 Sprint2] 강사 출결 미표시로 초기화(clear)
  mode?: "in_person" | "online";
  isPublic?: boolean;
  // 반복 편집 범위(this=이 일정만 · this_and_following=이후 전부 · all=시리즈 전체). seriesId가 있을 때만 의미.
  scope?: "this" | "this_and_following" | "all"; force?: boolean;
  expectedSeriesVersion?: number; // [TBO-29C C3] series edit CAS — 불일치 시 409 SERIES_VERSION_STALE
  acknowledgeAccountingImpact?: boolean;
  expectedAccountingImpactHash?: string; // [74D-0] 직전 409 impactHash — ack를 본 영향에 결속(삭제와 동일 계약)
};
export type ScheduleRequestApprovalOptions = {
  forceConflicts?: boolean;
  acknowledgeAccountingImpact?: boolean;
  expectedAccountingImpactHash?: string;
};
// [TBO-19] 강사 출결 현황 집계 응답
type InstructorAttendanceRow = {
  instructorId: number; instructorName: string;
  held: number; present: number; late: number; absent: number; makeup: number; unmarked: number;
  attendanceRate: number | null; teachingMinutes: number; teachingHours: number;
};
export type InstructorAttendanceSummary = {
  from?: string; to?: string;
  rows: InstructorAttendanceRow[];
  totals: { instructors: number; held: number; present: number; late: number; absent: number; makeup: number; unmarked: number; teachingHours: number };
};
export type ConflictCheckBody = {
  sessionDate: string; startTime: string; endTime?: string; durationMinutes?: number;
  instructorId?: number; roomId?: number; ignoreSessionId?: number;
};

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
    // [TBO-62 ④ 2026-07-24] 강사 본인 출결 체크(최초 1회) — 수정·초기화는 매니저 PATCH 전용.
    markInstructorAttendance: (id: number, status: InstructorAttendanceStatus) =>
      http.post<{ row: ScheduleRow }>(`/schedule/${id}/instructor-attendance`, { status }).then((r) => r.data),
    // [TBO-64 2026-07-24] 회차 가격 책정(정산 연결 전) — null=해제. 매니저 이상.
    setPayAmount: (id: number, amount: number | null) =>
      http.put<{ row: ScheduleRow }>(`/schedule/${id}/pay-amount`, { amount }).then((r) => r.data),
    // [TBO-63 2026-07-24] 삭제 복구(캘린더 undo) — soft delete 해제.
    restore: (id: number) =>
      http.post<{ row: ScheduleRow }>(`/schedule/${id}/restore`).then((r) => r.data),
    // 추천→배정·수동 추가 → { row, conflicts }. 충돌 시 409 → force로 재시도.
    create: (body: ScheduleCreateBody) =>
      http.post<{ row: ScheduleRow; conflicts: Conflict[] }>("/schedule", body).then((r) => r.data),
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
      http.patch<{ row: ScheduleRow; conflicts: Conflict[]; updated: number }>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
    // 세션 삭제(soft delete — v9). [TBO-29C C3] scope(this/this_and_following/all) + series CAS 지원.
    remove: (id: number, opts?: {
      scope?: "this" | "this_and_following" | "all";
      expectedSeriesVersion?: number;
      acknowledgeAccountingImpact?: boolean;
      expectedAccountingImpactHash?: string;
    }) =>
      http.delete<{ id: number; deleted: boolean; removedIds: number[] }>(`/schedule/${id}`, { params: opts }).then((r) => r.data),
  },
  // 강사 수업 요청 → 매니저 승인/반려(TBO-16 #9). 승인=서버가 createSession 재사용(409+force 동일 규약).
  scheduleRequests: {
    list: (status?: ScheduleRequest["status"], options: ApiReadOptions = {}) =>
      http.get<ScheduleRequestEx[]>("/schedule-requests", { ...options, params: status ? { status } : {} }).then((r) => r.data),
    create: (input: CreateScheduleRequestBody) =>
      http.post<{ row: ScheduleRequestEx; conflicts: Conflict[] }>("/schedule-requests", input).then((r) => r.data),
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
