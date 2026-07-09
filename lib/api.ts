// 백엔드(NestJS) REST 클라이언트 — Axios.
// baseURL = `${NEXT_PUBLIC_API_URL}/api`. 로컬은 미설정 시 next.config rewrites가 localhost로 프록시,
// 배포(Vercel)는 NEXT_PUBLIC_API_URL을 백엔드 도메인으로 지정하면 직접 호출(백엔드 CORS 허용).
import axios from "axios";
import { logger } from "./log";
import { safeLogValue, safeUrlForLog } from "./log-redaction";
import { getToken, clearToken } from "./auth";
import { isPublicRoute } from "./auth-routes";
import type {
  CalendarViewPreset,
  CreateViewPresetInput,
  ReportTemplate,
  Student,
  Enrollment,
  Payment,
  Expense,
  Course,
  Subject,
  CounselForm,
  CounselRound,
  Transaction,
  AcademyEvent,
  CreateEventInput,
  AuditLog,
  Attendance,
  AttendanceStatus,
  Roadmap,
  RoadmapCourse,
  CreateRoadmapInput,
  Parent,
  ParentStudent,
  CreateCourseInput,
  CreateSubjectInput,
  CreatePaymentInput,
  UpdatePaymentInput,
  CreateExpenseInput,
  CreateCounselInput,
  UpdateCounselInput,
  CreateCounselRoundInput,
  CreateStudentInput,
  CreateEnrollmentInput,
  WebIdCheckResult,
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
  InstructorAttendanceStatus,
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number };
export type AvailabilityKindEx = AvailabilityKind | "online_only";
export type ScheduleRequestKindEx = "session_create" | "session_update" | "availability_upsert" | "availability_delete";
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
  mode?: "in_person" | "online"; // [C2D] 요청 payload 수업방식(session_create)
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 불변 필드(requestKind·target·owner) 제외 부분 패치
export type UpdateScheduleRequestBody = {
  courseId?: number; instructorId?: number; roomId?: number;
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  studentIds?: number[]; topic?: string; kind?: SessionKind; mode?: "in_person" | "online";
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
  // 반복 편집 범위(this=이 일정만 · this_and_following=이후 전부 · all=시리즈 전체). seriesId가 있을 때만 의미.
  scope?: "this" | "this_and_following" | "all"; force?: boolean;
};
// [TBO-19 Sprint4] 강사 계약(백엔드 로컬 타입 — @kms545487/contracts 미포함). DB 이관 시 contracts로 승격 검토.
export type InstructorContract = {
  id: number; instructorId: number; monthlyHours: number; hourlyRate: number;
  periodStart: string; periodEnd?: string; active: boolean; memo?: string;
  createdAt: string; updatedAt: string;
};
// [TBO-19] 강사 출결 현황 집계 응답
export type InstructorAttendanceRow = {
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

// ── TBO-05 시수·페이 정산 타입(백엔드 reports/payouts 모듈 응답) ──
export type ReportStatus = "draft" | "submitted" | "approved" | "rejected";
export type SessionReport = {
  id: number; sessionId: number; studentId: number; instructorId: number; subjectId?: number;
  content: string; homework?: string; status: ReportStatus;
  submittedAt?: string; approvedAt?: string; approvedBy?: number; rejectedReason?: string;
  createdAt: string; updatedAt: string;
};
// 정산 라인(세션 1건 산정 스냅샷)
export type PayoutLine = {
  sessionId: number; courseId: number; courseName: string; sessionDate: string;
  durationMinutes: number; hourlyRate: number; amount: number;
};
// 산정 미리보기(읽기전용)
export type MeasureResult = {
  instructorId: number; periodStart: string; periodEnd: string;
  sessionCount: number; totalMinutes: number; computedAmount: number; lines: PayoutLine[];
};
export type PayoutRowStatus = "pending" | "confirmed" | "paid" | "rejected";
export type PayoutRow = {
  id: number; instructorId: number; periodStart: string; periodEnd: string;
  sessionCount: number; totalMinutes: number; computedAmount: number;
  adjustedAmount?: number; adjustReason?: string; amount: number;
  status: PayoutRowStatus; lines: PayoutLine[]; rejectedReason?: string;
  paidAt?: string; confirmedAt?: string; createdAt: string; updatedAt: string;
};
export type LedgerTx = {
  id: number; direction: "in" | "out"; category: string; label: string;
  amount: number; occurredAt: string; payoutId?: number;
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const http = axios.create({
  baseURL: `${BASE}/api`,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// 모든 API 요청/응답/에러를 한 곳에서 로깅 — 문제 발생 시 콘솔에서 어떤 호출이 실패했는지 즉시 확인.
// (브라우저 콘솔에서 [TACO:api] 로 필터. 끄려면 localStorage taco_debug="0")
const apiLog = logger("api");
// [R3 2026-07-06] network 계측 — 요청 개수·시작 시각(응답에서 duration 산출). PII·바디 미기록.
let reqSeq = 0;
type MetaConfig = { meta?: { seq: number; start: number } };

http.interceptors.request.use((cfg) => {
  (cfg as unknown as MetaConfig).meta = { seq: ++reqSeq, start: Date.now() };
  // 로그인 토큰이 있으면 모든 요청에 Bearer로 첨부 → 백엔드 RBAC 가드 대비(권한 체크 일관).
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  apiLog.debug(`→ ${cfg.method?.toUpperCase()} ${safeUrlForLog(cfg.url)}`, safeLogValue(cfg.params ?? cfg.data ?? ""));
  return cfg;
});
http.interceptors.response.use(
  (res) => {
    // [R3] category=http 계측: #요청번호 · duration(ms) — "요청 개수·요청 시간·반환 시간"
    const meta = (res.config as unknown as MetaConfig).meta;
    apiLog.debug(`← ${res.status} ${res.config.method?.toUpperCase() ?? ""} ${safeUrlForLog(res.config.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}`);
    return res;
  },
  (err) => {
    const status = err?.response?.status ?? "ERR";
    const meta = (err?.config as unknown as MetaConfig)?.meta;
    apiLog.error(
      `✗ ${status} ${err?.config?.method?.toUpperCase() ?? ""} ${safeUrlForLog(err?.config?.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}`,
      safeLogValue(err?.response?.data ?? err?.message),
    );
    // 401(토큰 없음/만료): 조용히 실패하지 않고 로그인으로 유도 — 세션이 끊긴 걸 사용자에게 알림.
    // 단, 로그인 시도 자체의 401(잘못된 자격)이나 공개 경로에선 리다이렉트하지 않음.
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !isPublicRoute(window.location.pathname) &&
      !String(err?.config?.url ?? "").includes("/auth/login")
    ) {
      clearToken();
      window.location.href = "/login?expired=1";
    }
    return Promise.reject(err);
  },
);

export type LoginBody = { webId: string; password?: string };
export type LoginResult = { accessToken: string; account: { id: number; name: string; role: string } };
export type SignupBody = { webId: string; name: string; email: string; password: string; role?: string };
export type SignupResult = { ok: boolean; message: string; account: { id: number; webId: string; name: string; role: string; status: string }; devVerifyLink?: string };
export type PendingAccount = { id: number; webId: string; name: string; email: string; role: string; status: string; emailVerified: boolean; createdAt: string };

// [통신 감사 2026-07-03] Authorization은 요청 인터셉터(getToken)가 전 요청에 단일 부착 —
//  이전의 수동 authHeader(token)는 인터셉터가 덮어써 사실상 무시되던 이중 소스라 제거(통일).
export const api = {
  health: () => http.get<{ status: string; service: string; ts: string }>("/health").then((r) => r.data),
  auth: {
    // 로그인 — webId+비밀번호(해시 검증) → 토큰 발급
    login: (body: LoginBody) => http.post<LoginResult>("/auth/login", body).then((r) => r.data),
    // 가입 신청(대표 승인 대기) → 인증 메일 발송
    signup: (body: SignupBody) => http.post<SignupResult>("/auth/signup", body).then((r) => r.data),
    // 이메일 인증(메일 링크 token)
    verifyEmail: (token: string) =>
      http.get<{ ok: boolean; message: string }>("/auth/verify-email", { params: { token } }).then((r) => r.data),
    // 토큰 검증(서버에서 claims 반환)
    me: () =>
      http.get<{ sub: number; name: string; roles: string[] }>("/auth/me").then((r) => r.data),
    // 대표(super_admin) 전용 — 승인 대기 목록·승인·반려
    pending: () => http.get<PendingAccount[]>("/auth/pending").then((r) => r.data),
    approve: (id: number, role?: string) =>
      http.post<PendingAccount>(`/auth/approve/${id}`, { role }).then((r) => r.data),
    reject: (id: number) =>
      http.post<PendingAccount>(`/auth/reject/${id}`, {}).then((r) => r.data),
  },
  students: {
    list: () => http.get<Student[]>("/students").then((r) => r.data),
    get: (id: number) => http.get<Student>(`/students/${id}`).then((r) => r.data),
    create: (body: CreateStudentInput) => http.post<Student>("/students", body).then((r) => r.data),
    // [피드백 2026-07-03] 캘린더 우측 패널 학생 정보 수정(출국/입국·상태 변경) — PATCH 부분 갱신.
    update: (id: number, patch: Partial<Pick<Student, "name" | "englishName" | "grade" | "phone" | "country" | "residenceType" | "status" | "memo">>) =>
      http.patch<Student>(`/students/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<Student>(`/students/${id}`).then((r) => r.data),
  },
  enrollments: {
    list: (studentId?: number) =>
      http.get<Enrollment[]>("/enrollments", { params: studentId ? { studentId } : undefined }).then((r) => r.data),
    create: (body: CreateEnrollmentInput) => http.post<Enrollment>("/enrollments", body).then((r) => r.data),
  },
  payments: {
    list: () => http.get<Payment[]>("/payments").then((r) => r.data),
    create: (input: CreatePaymentInput) => http.post<Payment>("/payments", input).then((r) => r.data),
    update: (id: number, patch: UpdatePaymentInput) => http.patch<Payment>(`/payments/${id}`, patch).then((r) => r.data),
    markPaid: (id: number) => http.post<Payment>(`/payments/${id}/pay`, {}).then((r) => r.data),
    // 환불(원장 완결성 2026-07-03): paid → refunded + 원장 출금 1줄(paymentId 역참조). 멱등은 백엔드 400.
    refund: (id: number) => http.post<Payment>(`/payments/${id}/refund`, {}).then((r) => r.data),
  },
  expenses: {
    list: () => http.get<Expense[]>("/expenses").then((r) => r.data),
    create: (input: CreateExpenseInput) => http.post<Expense>("/expenses", input).then((r) => r.data),
    approve: (id: number) => http.post<Expense>(`/expenses/${id}/approve`, {}).then((r) => r.data),
    // 반려 사유 **필수**(Q2 2026-07-06 — 반려류 패턴 통일). 서버 저장(Expense.rejectedReason).
    reject: (id: number, reason: string) => http.post<Expense>(`/expenses/${id}/reject`, { reason }).then((r) => r.data),
  },
  // 캘린더 뷰 프리셋(TBO-12 P1) — 직원 공용 자산(DB 컬렉션, localStorage 대체).
  viewPresets: {
    list: () => http.get<CalendarViewPreset[]>("/view-presets").then((r) => r.data),
    create: (input: CreateViewPresetInput) => http.post<CalendarViewPreset>("/view-presets", input).then((r) => r.data),
    update: (id: number, input: CreateViewPresetInput) => http.patch<CalendarViewPreset>(`/view-presets/${id}`, input).then((r) => r.data),
    remove: (id: number) => http.delete<CalendarViewPreset>(`/view-presets/${id}`).then((r) => r.data),
  },
  // 리포트 템플릿(자산화) — zustand → DB 컬렉션.
  reportTemplates: {
    list: () => http.get<ReportTemplate[]>("/report-templates").then((r) => r.data),
    create: (input: { name: string; content: string; homework?: string }) =>
      http.post<ReportTemplate>("/report-templates", input).then((r) => r.data),
    remove: (id: number) => http.delete<ReportTemplate>(`/report-templates/${id}`).then((r) => r.data),
  },
  courses: {
    list: () => http.get<Course[]>("/courses").then((r) => r.data),
    create: (input: CreateCourseInput) => http.post<Course>("/courses", input).then((r) => r.data),
  },
  subjects: {
    list: () => http.get<Subject[]>("/subjects").then((r) => r.data),
    create: (input: CreateSubjectInput) => http.post<Subject>("/subjects", input).then((r) => r.data),
  },
  counsel: {
    forms: () => http.get<CounselForm[]>("/counsel").then((r) => r.data),
    rounds: (counselFormId?: number) =>
      http.get<CounselRound[]>("/counsel/rounds", { params: counselFormId ? { counselFormId } : undefined }).then((r) => r.data),
    create: (input: CreateCounselInput) => http.post<CounselForm>("/counsel", input).then((r) => r.data),
    update: (id: number, patch: UpdateCounselInput) => http.patch<CounselForm>(`/counsel/${id}`, patch).then((r) => r.data),
    createRound: (formId: number, input: CreateCounselRoundInput) =>
      http.post<CounselRound>(`/counsel/${formId}/rounds`, input).then((r) => r.data),
  },
  transactions: {
    list: () => http.get<Transaction[]>("/transactions").then((r) => r.data),
  },
  events: {
    list: () => http.get<AcademyEvent[]>("/events").then((r) => r.data),
    create: (input: CreateEventInput) => http.post<AcademyEvent>("/events", input).then((r) => r.data),
  },
  // [TBO-19 Sprint4] 강사 계약(읽기 전용 — 매니저) — 백엔드 로컬 타입(contracts 미포함)
  instructorContracts: {
    list: () => http.get<InstructorContract[]>("/instructor-contracts").then((r) => r.data),
  },
  // [R-6] 변경 이력(audit_log) — ADMIN. entity/entityId로 개별 세션 등의 이력 조회(최신순).
  audit: {
    list: (entity: string, entityId: number, limit?: number) =>
      http.get<AuditLog[]>("/audit", { params: { entity, entityId, limit } }).then((r) => r.data),
  },
  attendance: {
    list: () => http.get<Attendance[]>("/attendance").then((r) => r.data),
    upsert: (body: { sessionId: number; studentId: number; status: AttendanceStatus }) =>
      http.put<Attendance>("/attendance", body).then((r) => r.data),
  },
  roadmaps: {
    list: () => http.get<Roadmap[]>("/roadmaps").then((r) => r.data),
    courses: () => http.get<RoadmapCourse[]>("/roadmaps/courses").then((r) => r.data),
    create: (input: CreateRoadmapInput) => http.post<Roadmap>("/roadmaps", input).then((r) => r.data),
  },
  parents: {
    list: () => http.get<Parent[]>("/parents").then((r) => r.data),
    relations: () => http.get<ParentStudent[]>("/parents/relations").then((r) => r.data),
  },
  users: {
    // web id 존재 확인 (등록 폼 "확인하기")
    exists: (webId: string) =>
      http.get<WebIdCheckResult>("/users/exists", { params: { webId } }).then((r) => r.data),
  },
  // ── 스케줄(v5) ──
  schedule: {
    list: (q: ScheduleQuery = {}) =>
      http.get<ScheduleRow[]>("/schedule", { params: q }).then((r) => r.data),
    // 자원 피커(강사·강의실·학생)
    resources: () => http.get<ScheduleResources>("/schedule/resources").then((r) => r.data),
    // [TBO-19] 강사 출결 현황 집계(관리자 대시보드) — 기간·강사 필터
    instructorAttendanceSummary: (from?: string, to?: string, instructorId?: number) =>
      http.get<InstructorAttendanceSummary>("/schedule/instructor-attendance-summary", { params: { from, to, instructorId } }).then((r) => r.data),
    // 추천→배정·수동 추가 → { row, conflicts }. 충돌 시 409 → force로 재시도.
    create: (body: ScheduleCreateBody) =>
      http.post<{ row: ScheduleRow; conflicts: Conflict[] }>("/schedule", body).then((r) => r.data),
    // 이동·리사이즈·편집 → { row, conflicts }. 충돌 시 409(서버) → force로 재시도.
    update: (id: number, body: SchedulePatchBody) =>
      http.patch<{ row: ScheduleRow; conflicts: Conflict[]; updated: number }>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
    // 세션 삭제(soft delete — v9)
    remove: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/schedule/${id}`).then((r) => r.data),
  },
  // 강사 수업 요청 → 매니저 승인/반려(TBO-16 #9). 승인=서버가 createSession 재사용(409+force 동일 규약).
  scheduleRequests: {
    list: (status?: ScheduleRequest["status"]) =>
      http.get<ScheduleRequestEx[]>("/schedule-requests", { params: status ? { status } : {} }).then((r) => r.data),
    create: (input: CreateScheduleRequestBody) =>
      http.post<{ row: ScheduleRequestEx; conflicts: Conflict[] }>("/schedule-requests", input).then((r) => r.data),
    approve: (id: number, force?: boolean) =>
      http.post<{ request: ScheduleRequestEx; conflicts: Conflict[] }>(`/schedule-requests/${id}/approve`, {}, { params: force ? { force: "true" } : {} }).then((r) => r.data),
    reject: (id: number, reason: string) => // 사유 필수(Q2)
      http.post<ScheduleRequestEx>(`/schedule-requests/${id}/reject`, { reason }).then((r) => r.data),
    update: (id: number, body: UpdateScheduleRequestBody) => // [C2C-b] pending 수정(관리자)
      http.patch<ScheduleRequestEx>(`/schedule-requests/${id}`, body).then((r) => r.data),
    withdraw: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/schedule-requests/${id}`).then((r) => r.data),
  },
  rooms: {
    list: () => http.get<Room[]>("/rooms").then((r) => r.data),
  },
  availability: {
    list: (ownerType: AvailabilityOwner, ownerId: number) =>
      http
        .get<AvailabilityBlock[]>("/availability", { params: { ownerType, ownerId } })
        .then((r) => r.data),
    // 전체 블록(추천 컨텍스트용 — 학생+강사+강의실 가용/불가 한 번에)
    all: () => http.get<AvailabilityBlock[]>("/availability").then((r) => r.data),
    // 가용/불가(Block) 생성·수정(id 있으면 수정)
    upsert: (body: AvailabilityUpsertBody) =>
      http.put<AvailabilityBlock>("/availability", body).then((r) => r.data),
    remove: (id: number) =>
      http.delete<{ id: number; deleted: boolean }>(`/availability/${id}`).then((r) => r.data),
  },
  // ── 수업 보고서(TBO-05) — 강사 제출 → 관리자 승인/반려 ──
  reports: {
    list: (sessionId?: number) =>
      http.get<SessionReport[]>("/reports", { params: sessionId ? { sessionId } : undefined }).then((r) => r.data),
    create: (body: { sessionId: number; studentId: number; instructorId?: number; content: string; homework?: string; status?: "draft" | "submitted" }) =>
      http.post<SessionReport>("/reports", body).then((r) => r.data),
    submit: (id: number) => http.post<SessionReport>(`/reports/${id}/submit`, {}).then((r) => r.data),
    approve: (id: number, approvedBy?: number) =>
      http.post<SessionReport>(`/reports/${id}/approve`, { approvedBy }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<SessionReport>(`/reports/${id}/reject`, { reason }).then((r) => r.data),
  },
  // ── 강사 페이 정산(TBO-05) — 시수×시급 산정 → 승인 → 지급 ──
  payouts: {
    list: () => http.get<PayoutRow[]>("/payouts").then((r) => r.data),
    mine: () => http.get<PayoutRow[]>("/payouts/me").then((r) => r.data),
    get: (id: number) => http.get<PayoutRow>(`/payouts/${id}`).then((r) => r.data),
    // 읽기전용 산정 미리보기(정산서 생성 없음). 적격: held + 승인 보고서.
    preview: (instructorId: number, from: string, to: string) =>
      http.get<MeasureResult>("/payouts/preview", { params: { instructorId, from, to } }).then((r) => r.data),
    previewMine: (from: string, to: string) =>
      http.get<MeasureResult>("/payouts/me/preview", { params: { from, to } }).then((r) => r.data),
    // 정산서 생성(pending) + 세션 연결(이중 계상 방지)
    generate: (instructorId: number, from: string, to: string) =>
      http.post<PayoutRow>("/payouts/generate", { instructorId, from, to }).then((r) => r.data),
    confirm: (id: number) => http.post<PayoutRow>(`/payouts/${id}/confirm`, {}).then((r) => r.data),
    // 관리자 급여 수정(실효 지급액 덮어쓰기, 자동 산정액 보존)
    adjust: (id: number, amount: number, reason?: string) =>
      http.post<PayoutRow>(`/payouts/${id}/adjust`, { amount, reason }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<PayoutRow>(`/payouts/${id}/reject`, { reason }).then((r) => r.data),
    // 지급 완료(confirmed → paid) + 통합 원장 출금 기록
    pay: (id: number) =>
      http.post<{ payout: PayoutRow; transaction: LedgerTx }>(`/payouts/${id}/pay`, {}).then((r) => r.data),
  },
};
