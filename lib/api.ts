// 백엔드(NestJS) REST 클라이언트 — Axios.
// 브라우저는 항상 same-origin `/api`만 호출한다. next.config rewrite가 server-side로 backend에 전달해
// HttpOnly session cookie가 frontend origin에 귀속되고 cross-origin token 노출을 없앤다.
import axios, { type AxiosRequestConfig } from "axios";
import { logger } from "./log";
import { safeLogValue, safeUrlForLog } from "./log-redaction";
import { isPublicRoute } from "./auth-routes";
import { resetPreferences } from "./storage/preferences";
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
  RecurrenceScope,
  InstructorAttendanceStatus,
  ReportApprovalStatus,
  ReportStatus,
} from "@kms545487/contracts";

export type ScheduleQuery = { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number };
export type AvailabilityKindEx = AvailabilityKind | "online_only";
export type ScheduleRequestKindEx = "session_create" | "session_update" | "session_delete" | "availability_upsert" | "availability_delete";
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
  scope?: RecurrenceScope;
  mode?: "in_person" | "online"; // [C2D] 요청 payload 수업방식(session_create)
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 불변 필드(requestKind·target·owner) 제외 부분 패치
export type UpdateScheduleRequestBody = {
  courseId?: number; instructorId?: number; roomId?: number;
  sessionDate?: string; startTime?: string; endTime?: string; durationMinutes?: number;
  studentIds?: number[]; topic?: string; kind?: SessionKind; mode?: "in_person" | "online";
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
};
// [TBO-29C C2] 반복 생성 bulk command — 단건 loop/클라이언트 seriesId(Date.now()) 폐기.
//  서버가 series ID를 발급하고 날짜/요일/기간/시간/cohort/FK를 전체 정규화·원자 커밋.
export type ScheduleSeriesCreateBody = {
  courseId: number; instructorId?: number; roomId?: number; studentIds?: number[];
  repeat: { kind: "weekly" | "custom"; weekdays: number[]; startsOn: string; endsOn: string };
  startTime: string; endTime?: string; durationMinutes?: number; timeZone?: string;
  topic?: string; memo?: string; color?: string; status?: string;
  kind?: SessionKind; price?: number; mode?: "in_person" | "online"; force?: boolean;
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
  // 반복 편집 범위(this=이 일정만 · this_and_following=이후 전부 · all=시리즈 전체). seriesId가 있을 때만 의미.
  scope?: "this" | "this_and_following" | "all"; force?: boolean;
  expectedSeriesVersion?: number; // [TBO-29C C3] series edit CAS — 불일치 시 409 SERIES_VERSION_STALE
  acknowledgeAccountingImpact?: boolean;
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
export type SessionReport = {
  id: number; sessionId: number; studentId: number; instructorId: number; subjectId?: number;
  content: string; homework?: string; status: ReportStatus; approvalStatus?: ReportApprovalStatus;
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
  // [B9 E5 2026-07-16] 지급 회수 — 회수된 정산은 status='rejected' + reversedAt(ISO) 세트(반려와 구분 표기)
  reversedAt?: string;
};
export type LedgerTx = {
  id: number; direction: "in" | "out"; category: string; label: string;
  amount: number; occurredAt: string; payoutId?: number;
};

export type ApiReadOptions = Pick<AxiosRequestConfig, "signal">;

export const http = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  // access/refresh token은 HttpOnly cookie로만 운반한다. same-origin BFF 요청에도 credentials를 명시해
  // 브라우저 정책과 테스트 adapter에서 cookie 동봉 의도를 고정한다.
  withCredentials: true,
});

// [TBO-34 C1] access cookie 만료(401) 시 HttpOnly refresh cookie를 회전해 새 access cookie를 받는다.
// raw token은 JavaScript 응답/상태에 존재하지 않는다. 단일 비행 후 원 요청을 cookie로 1회 재시도한다.
let refreshInFlight: Promise<boolean> | null = null;
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post("/api/auth/refresh", {}, { withCredentials: true, timeout: 10000 })
      .then(() => true)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout)/;

// 모든 API 요청/응답/에러를 한 곳에서 로깅 — 문제 발생 시 콘솔에서 어떤 호출이 실패했는지 즉시 확인.
// (브라우저 콘솔에서 [TACO:api] 로 필터. 운영 debug 플래그는 lib/storage/preferences에서 관리)
const apiLog = logger("api");
// [R3 2026-07-06] network 계측 — 요청 개수·시작 시각(응답에서 duration 산출). PII·바디 미기록.
let reqSeq = 0;
let expiredRedirectStarted = false;
type MetaConfig = { meta?: { seq: number; start: number } };

http.interceptors.request.use((cfg) => {
  (cfg as unknown as MetaConfig).meta = { seq: ++reqSeq, start: Date.now() };
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
  async (err) => {
    if (axios.isCancel(err)) return Promise.reject(err);
    const status = err?.response?.status ?? "ERR";
    const meta = (err?.config as unknown as MetaConfig)?.meta;
    apiLog.error(
      `✗ ${status} ${err?.config?.method?.toUpperCase() ?? ""} ${safeUrlForLog(err?.config?.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}`,
      safeLogValue(err?.response?.data ?? err?.message),
    );
    // [대표 지시 ④] 401 → refresh 회전으로 조용한 갱신 시도(1회) — 성공 시 원 요청 재실행.
    //  auth 계열 엔드포인트 자신·이미 재시도한 요청은 제외(무한 루프 방지).
    const cfg = err?.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (
      status === 401 && cfg && !cfg._retried &&
      typeof window !== "undefined" &&
      !AUTH_ENDPOINTS.test(String(cfg.url ?? ""))
    ) {
      const renewed = await refreshAccessToken();
      if (renewed) {
        cfg._retried = true;
        return http.request(cfg);
      }
    }
    // 401(토큰 없음/만료 + 갱신 실패): 조용히 실패하지 않고 로그인으로 유도 — 세션이 끊긴 걸 사용자에게 알림.
    // 단, 로그인 시도 자체의 401(잘못된 자격)이나 공개 경로에선 리다이렉트하지 않음.
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !isPublicRoute(window.location.pathname) &&
      !String(err?.config?.url ?? "").includes("/auth/login") &&
      !expiredRedirectStarted
    ) {
      expiredRedirectStarted = true;
      resetPreferences(); // [E0 storage 감사] 세션 만료 경로도 취향 preference 정리(계정 간 누출 차단)
      window.location.assign("/login?expired=1");
    }
    return Promise.reject(err);
  },
);

export type LoginBody = { webId: string; password?: string };
export type LoginResult = { account: { id: number; name: string; role: string; mustChangePassword: boolean } };
// [E0.5 ⑥] name/email/phone은 첫 로그인 강제 변경(must_change_password)에서만 서버가 허용 —
//  평시 프로필 변경은 마이 페이지 인증/승인 경로(29B-4)를 지난다.
// [E0] newWebId도 강제 변경 흐름 전용(평시 아이디 변경 = 승인제). 평시 비밀번호 변경은
//  본인 이메일 OTP(verificationChallengeId) 소비 필수.
export type ChangeCredentialsBody = {
  currentPassword: string; newWebId?: string; newPassword?: string;
  name?: string; email?: string; phone?: string;
  // [대표 추가요청 2026-07-16] 첫 로그인 통합 설정 — users 수정 가능 컬럼 전부(강제 변경 흐름 전용).
  //  이메일은 설정할 새 이메일의 OTP verified challenge 소비 필수(verificationChallengeId).
  countryCode?: string; timeZone?: string; university?: string; major?: string; birthYear?: number;
  verificationChallengeId?: number;
};
// [E0.5 ④b] 가입 폼 확장 — 전화·대학·전공(승인 판단 근거, 승인 tx에서 강사 프로필 승계).
// [TBO-31 C2 2026-07-16] birthYear 입력 폐지 → rrn(주민등록번호 — 서버가 birthYear 파생·암호화 저장,
//  형식은 lib/validation.isValidRrn 단일 소스)·emailChallengeId(가입 전 이메일 OTP verified challenge —
//  가입 tx에서 일회 소비, 계정은 emailVerified=true로 생성) 필수.
export type SignupBody = {
  webId: string; name: string; email: string; password: string; role?: string;
  rrn: string; emailChallengeId: number;
  phone?: string; university?: string; major?: string;
};
// [TBO-31 C2] devVerifyLink 제거 — OTP 가입은 emailVerified=true 생성이라 인증 링크 단계가 소멸.
export type SignupResult = { ok: boolean; message: string; account: { id: number; webId: string; name: string; role: string; status: string } };
// [TBO-31 C2] 가입 전 이메일 OTP challenge(공개) — devOtpCode는 비production+SMTP 부재에서만
//  응답에 실린다(기존 devVerifyLink 관례의 OTP판 — 개발 안내 표기용).
export type SignupEmailChallenge = {
  id: number;
  maskedTarget: string;
  expiresAt: string;
  resendAvailableAt: string;
  devOtpCode?: string;
};
export type PendingAccount = {
  id: number; webId: string; name: string; email: string; role: string; status: string; emailVerified: boolean; createdAt: string;
  // [E0.5 ④b] 지원자 제공 정보 — 승인센터 상세 표시(승인 판단 근거).
  phone?: string | null; university?: string | null; major?: string | null; birthYear?: number | null;
};
export type MyProfile = {
  id: number;
  webId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  countryCode?: string | null;
  timeZone?: string | null;
  profileVersion: number;
  // [2026-07-16] SMS 인증 가용(BE provider env 완비) — phone 변경 스테퍼 동적 활성(env만으로 전환)
  smsVerificationAvailable?: boolean;
  // [TBO-31 C2/C3 2026-07-16] 이메일 인증 상태 — 마이 페이지 배지(미인증=주의 톤). 구서버 호환 optional.
  emailVerified?: boolean;
};
export type ProfileChangeFields = {
  name?: string;
  webId?: string; // [E0] 아이디 변경 — 승인제(대표 결정). 승인 시 기존 세션 전부 무효(재로그인)
  email?: string; // [TBO-29B-4] 이메일 변경 — 사전 인증(challenge) 필수, 비우기 불가
  phone?: string | null;
  countryCode?: string | null;
  timeZone?: string | null;
};
// [E0.5 ④] 국가·시간대 카탈로그 행 — BE countries 표(참조 데이터)와 1:1.
export type CatalogCountry = {
  id: number;
  code: string; // ISO alpha-2 또는 권역 분할 코드(US-W)
  nameKo: string;
  nameEn: string;
  timeZone: string; // 대표 IANA tz
  flag?: string | null;
  sortOrder: number;
};
export type ProfileChangeRequest = {
  id: number;
  requesterId: number;
  beforeValues: ProfileChangeFields;
  requestedChanges: ProfileChangeFields;
  reason: string;
  baseProfileVersion: number;
  status: "pending" | "approved" | "rejected";
  decidedBy?: number;
  decidedAt?: string;
  rejectionReason?: string;
  appliedProfileVersion?: number;
  createdAt: string;
  updatedAt: string;
};
// [TBO-29B-4] 모든 프로필 변경 요청은 현재 비밀번호 재확인 필수. 연락처(email/phone 채움) 변경은
//  verified challenge id를 함께 보내 서버 tx 안에서 일회 소비된다.
export type CreateProfileChangeRequestBody = ProfileChangeFields & {
  reason: string;
  currentPassword: string;
  verificationChallengeId?: number;
};
// [TBO-29B-4] 연락처 인증 challenge — 응답은 masked target·상태·만료·재전송 시각만(§6).
export type ProfileVerificationChannel = "email" | "sms";
export type ProfileVerification = {
  id: number;
  channel: ProfileVerificationChannel;
  maskedTarget: string;
  status: "pending" | "verified" | "consumed" | "expired" | "locked";
  expiresAt: string;
  resendAvailableAt: string;
  attemptsLeft?: number;
};
export type CreateProfileVerificationBody = {
  currentPassword: string;
  channel: ProfileVerificationChannel;
  target: string;
};
// GET /users is the admin comparison source. New profile fields are optional while older servers roll forward.
export type UserProfileSummary = Omit<MyProfile, "profileVersion"> & {
  profileVersion?: number;
  createdAt?: string;
  updatedAt?: string;
};

// [TBO-34 C1] 인증은 backend-set HttpOnly cookie 단일 소스. Bearer 조립/토큰 decode를 금지한다.
export const api = {
  health: () => http.get<{ status: string; service: string; ts: string }>("/health").then((r) => r.data),
  auth: {
    // 로그인 — webId+비밀번호 검증 → HttpOnly access/refresh cookie + 안전한 account projection
    login: (body: LoginBody) => http.post<LoginResult>("/auth/login", body).then((r) => r.data),
    // 가입 신청(대표 승인 대기) — [TBO-31 C2] 이메일 OTP challenge 소비, emailVerified=true 생성.
    signup: (body: SignupBody) => http.post<SignupResult>("/auth/signup", body).then((r) => r.data),
    // [TBO-31 C2 2026-07-16] 가입 전 이메일 OTP — 발송(5회/분 스로틀·가입 여부와 무관하게 동일 응답).
    //  재전송 별도 엔드포인트 없음: 쿨다운(60초) 후 같은 호출이 기존 pending을 대체(새 코드).
    signupEmailChallenge: (email: string) =>
      http.post<SignupEmailChallenge>("/auth/signup-email-challenge", { email }).then((r) => r.data),
    // [TBO-31 C2] OTP 확인(10회/분) — 오답 400(한글 메시지·5회 잠금·만료), 성공 시 verified.
    confirmSignupEmailChallenge: (id: number, email: string, code: string) =>
      http.post<{ id: number; status: "verified" }>(`/auth/signup-email-challenge/${id}/confirm`, { email, code }).then((r) => r.data),
    // [TBO-31 C2] 아이디 가용성 공개 체크 — {available}만(이름·역할 미노출), 3자 미만 400·10회/분.
    webIdAvailable: (webId: string) =>
      http.get<{ available: boolean }>("/auth/web-id-available", { params: { webId } }).then((r) => r.data),
    // 이메일 인증(메일 링크 token)
    verifyEmail: (token: string) =>
      http.get<{ ok: boolean; message: string }>("/auth/verify-email", { params: { token } }).then((r) => r.data),
    // 토큰 검증(서버에서 claims 반환)
    me: () =>
      http.get<{ sub: number; name: string; roles: string[]; mustChangePassword?: boolean }>("/auth/me").then((r) => r.data),
    // [TBO-28B] 로그아웃 — auth_events 보안 기록(베스트에포트 호출, 토큰 폐기는 클라이언트).
    logout: () => http.post<{ ok: boolean }>("/auth/logout", {}).then((r) => r.data),
    // [유저 관리 2026-07-20] 재인증 게이트 — 민감 화면 진입 전 비밀번호 재확인(5회/분 스로틀).
    reauth: (currentPassword: string) => http.post<{ ok: true }>("/auth/reauth", { currentPassword }).then((r) => r.data),
    // [TBO-29C C5] 비로그인 복구 — 응답은 계정 존재와 무관하게 동일(dev 환경만 devWebId/devResetUrl 노출)
    recoverId: (email: string) =>
      http.post<{ ok: boolean; message: string; devWebId?: string }>("/auth/recover-id", { email }).then((r) => r.data),
    recoverPassword: (webId: string, email: string) =>
      http.post<{ ok: boolean; message: string; devResetUrl?: string }>("/auth/recover-password", { webId, email }).then((r) => r.data),
    resetPassword: (token: string, newPassword: string) =>
      http.post<{ ok: boolean }>("/auth/reset-password", { token, newPassword }).then((r) => r.data),
    // [TBO-31 C5 2026-07-20] 비로그인 복구 OTP판 — 발송/확인은 가입 OTP와 동일 응답 규약(purpose만 상이).
    recoveryEmailChallenge: (email: string) =>
      http.post<SignupEmailChallenge>("/auth/recovery-email-challenge", { email }).then((r) => r.data),
    confirmRecoveryEmailChallenge: (id: number, email: string, code: string) =>
      http.post<{ id: number; status: "verified" }>(`/auth/recovery-email-challenge/${id}/confirm`, { email, code }).then((r) => r.data),
    // 아이디 찾기 완료 — verified challenge 일회 소비 후 webId 목록을 화면에 표시(메일 왕복 제거).
    recoverIdComplete: (challengeId: number, email: string) =>
      http.post<{ webIds: string[] }>("/auth/recover-id/complete", { challengeId, email }).then((r) => r.data),
    // 비밀번호 재설정(OTP판) — 성공 시 기존 세션 전부 무효(auth_version+1).
    resetPasswordOtp: (challengeId: number, webId: string, email: string, newPassword: string) =>
      http.post<{ ok: boolean }>("/auth/reset-password-otp", { challengeId, webId, email, newPassword }).then((r) => r.data),
    // 대표(super_admin) 전용 — 승인 대기 목록·승인·반려
    // [TBO-28B] 승인=원자 tx(상태+승인메타+강사프로필+audit, 동시 결정 409) · 반려=사유 필수(400)
    pending: () => http.get<PendingAccount[]>("/auth/pending").then((r) => r.data),
    // [핫픽스 2026-07-20 ①] 레거시 pending 계정(구 링크 가입 — SMTP 부재기 메일 미발송) 인증 메일 재발송.
    // [핫픽스 2026-07-20] 가입 신청 삭제(pending·rejected) — 식별자 해제로 같은 아이디/이메일 재가입 허용.
    deletePendingAccount: (id: number, reason: string) =>
      http.delete<{ ok: boolean }>(`/auth/pending/${id}`, { data: { reason } }).then((r) => r.data),
    resendPendingVerification: (id: number) =>
      http.post<{ ok: boolean; message: string; devVerifyLink?: string }>(`/auth/pending/${id}/resend-verification`, {}).then((r) => r.data),
    approve: (id: number, role?: string, reason?: string) =>
      http.post<PendingAccount>(`/auth/approve/${id}`, { role, ...(reason ? { reason } : {}) }).then((r) => r.data),
    reject: (id: number, reason: string) =>
      http.post<PendingAccount>(`/auth/reject/${id}`, { reason }).then((r) => r.data),
  },
  account: {
    changeCredentials: (body: ChangeCredentialsBody) =>
      http.patch<{ id: number; webId: string; name: string; role: string; mustChangePassword: boolean }>("/users/me/credentials", body).then((r) => r.data),
    profile: () => http.get<MyProfile>("/users/me/profile").then((r) => r.data),
  },
  // [B3 2026-07-16] 알림 뱃지 읽음 — 탭별 마지막 열람 시각(서버 영속, 본인 것만).
  navSeen: {
    list: () => http.get<Record<string, string>>("/nav-seen").then((r) => r.data),
    mark: (navKey: string) => http.put<{ navKey: string; lastSeenAt: string }>("/nav-seen", { navKey }).then((r) => r.data),
  },
  students: {
    list: () => http.get<Student[]>("/students").then((r) => r.data),
    get: (id: number) => http.get<Student>(`/students/${id}`).then((r) => r.data),
    create: (body: CreateStudentInput) => http.post<Student>("/students", body).then((r) => r.data),
    // [TBO-29D D2] 원자 등록 — 학생+보호자(선택)+수강(선택)+audit 단일 tx(부분 저장 불가).
    register: (body: {
      student: CreateStudentInput;
      guardian?: { name: string; phone?: string; relation?: string; isPayer?: boolean; isPrimary?: boolean };
      courseId?: number;
    }) =>
      http.post<{
        student: Student;
        guardian: { parent: Parent; relation: ParentStudent; linkedExisting: boolean } | null;
        enrollment: Enrollment | null;
      }>("/students/registrations", body).then((r) => r.data),
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
    get: (id: number) => http.get<Payment>(`/payments/${id}`).then((r) => r.data), // [B7 E3] 상세 단건
    create: (input: CreatePaymentInput) => http.post<Payment>("/payments", input).then((r) => r.data),
    update: (id: number, patch: UpdatePaymentInput) => http.patch<Payment>(`/payments/${id}`, patch).then((r) => r.data),
    markPaid: (id: number) => http.post<Payment>(`/payments/${id}/pay`, {}).then((r) => r.data),
    // 환불(원장 완결성 2026-07-03): paid → refunded + 원장 출금 1줄(paymentId 역참조). 멱등은 백엔드 400.
    refund: (id: number) => http.post<Payment>(`/payments/${id}/refund`, {}).then((r) => r.data),
  },
  expenses: {
    list: () => http.get<Expense[]>("/expenses").then((r) => r.data),
    get: (id: number) => http.get<Expense>(`/expenses/${id}`).then((r) => r.data), // [B7 E3] 상세 단건
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
  counsel: {
    forms: () => http.get<CounselForm[]>("/counsel").then((r) => r.data),
    get: (id: number) => http.get<CounselForm>(`/counsel/${id}`).then((r) => r.data), // [B7 E3] 상세 단건(BE 신설)
    rounds: (counselFormId?: number) =>
      http.get<CounselRound[]>("/counsel/rounds", { params: counselFormId ? { counselFormId } : undefined }).then((r) => r.data),
    create: (input: CreateCounselInput) => http.post<CounselForm>("/counsel", input).then((r) => r.data),
    update: (id: number, patch: UpdateCounselInput) => http.patch<CounselForm>(`/counsel/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<CounselForm>(`/counsel/${id}`).then((r) => r.data),
    createRound: (formId: number, input: CreateCounselRoundInput) =>
      http.post<CounselRound>(`/counsel/${formId}/rounds`, input).then((r) => r.data),
  },
  transactions: {
    list: () => http.get<Transaction[]>("/transactions").then((r) => r.data),
  },
  events: {
    list: () => http.get<AcademyEvent[]>("/events").then((r) => r.data),
    create: (input: CreateEventInput) => http.post<AcademyEvent>("/events", input).then((r) => r.data),
    // [TBO-29D 요구 ⑥] 매니저 이상 — 수정(병합 후 구간 재검증)·소프트 삭제.
    update: (id: number, patch: Partial<CreateEventInput>) => http.patch<AcademyEvent>(`/events/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<AcademyEvent>(`/events/${id}`).then((r) => r.data),
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
    list: (options: ApiReadOptions = {}) => http.get<Attendance[]>("/attendance", options).then((r) => r.data),
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
    list: () => http.get<UserProfileSummary[]>("/users").then((r) => r.data),
    // [유저 관리 2026-07-20] 상세 단건(관리자 — super_admin 응답에만 rrnMasked)·대표 직접 수정·직접 등록.
    detail: (id: number) => http.get<UserProfileSummary & { rrnMasked?: string | null; university?: string | null; major?: string | null; birthYear?: number | null }>(`/users/${id}`).then((r) => r.data),
    adminUpdate: (id: number, patch: { name?: string; phone?: string; email?: string; role?: string }) =>
      http.patch<UserProfileSummary>(`/users/${id}`, patch).then((r) => r.data),
    createStaff: (input: { webId: string; name: string; password: string; role?: string; email?: string; phone?: string; university?: string; major?: string; birthYear?: number }) =>
      http.post<UserProfileSummary>("/users/instructors", input).then((r) => r.data),
  },
  // [E0.5 ④] 참조 데이터 카탈로그 — 국가·시간대 토글 옵션(자유 입력 폐지)의 단일 소스(DB 권위).
  catalog: {
    countries: () => http.get<CatalogCountry[]>("/catalog/countries").then((r) => r.data),
  },
  profileChangeRequests: {
    mine: () => http.get<ProfileChangeRequest[]>("/profile-change-requests/mine").then((r) => r.data),
    list: () => http.get<ProfileChangeRequest[]>("/profile-change-requests").then((r) => r.data),
    get: (id: number) => http.get<ProfileChangeRequest>(`/profile-change-requests/${id}`).then((r) => r.data),
    create: (body: CreateProfileChangeRequestBody) =>
      http.post<ProfileChangeRequest>("/profile-change-requests", body).then((r) => r.data),
    approve: (id: number) =>
      http.post<ProfileChangeRequest>(`/profile-change-requests/${id}/approve`, {}).then((r) => r.data),
    reject: (id: number, reason: string) =>
      http.post<ProfileChangeRequest>(`/profile-change-requests/${id}/reject`, { reason }).then((r) => r.data),
  },
  // [TBO-29B-4] 연락처 재인증 challenge — 발송(현재 비밀번호 재확인)·코드 확인(5회 잠금)·재전송(60초 cooldown).
  profileVerifications: {
    create: (body: CreateProfileVerificationBody) =>
      http.post<ProfileVerification>("/profile-verifications", body).then((r) => r.data),
    confirm: (id: number, code: string) =>
      http.post<ProfileVerification>(`/profile-verifications/${id}/confirm`, { code }).then((r) => r.data),
    resend: (id: number) =>
      http.post<ProfileVerification>(`/profile-verifications/${id}/resend`, {}).then((r) => r.data),
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
    // 추천→배정·수동 추가 → { row, conflicts }. 충돌 시 409 → force로 재시도.
    create: (body: ScheduleCreateBody) =>
      http.post<{ row: ScheduleRow; conflicts: Conflict[] }>("/schedule", body).then((r) => r.data),
    // [TBO-29C C2] 반복 생성 bulk — 서버 발급 series ID + 전체 원자 커밋(중간 실패=전부 롤백).
    createSeries: (body: ScheduleSeriesCreateBody) =>
      http.post<{ series: ScheduleSeriesInfo; rows: ScheduleRow[]; conflicts: Conflict[] }>("/schedule/series", body).then((r) => r.data),
    // 이동·리사이즈·편집 → { row, conflicts }. 충돌 시 409(서버) → force로 재시도.
    update: (id: number, body: SchedulePatchBody) =>
      http.patch<{ row: ScheduleRow; conflicts: Conflict[]; updated: number }>(`/schedule/${id}`, body).then((r) => r.data),
    conflicts: (body: ConflictCheckBody) =>
      http.post<Conflict[]>("/schedule/conflicts", body).then((r) => r.data),
    // 세션 삭제(soft delete — v9). [TBO-29C C3] scope(this/this_and_following/all) + series CAS 지원.
    remove: (id: number, opts?: { scope?: "this" | "this_and_following" | "all"; expectedSeriesVersion?: number }) =>
      http.delete<{ id: number; deleted: boolean; removedIds: number[] }>(`/schedule/${id}`, { params: opts }).then((r) => r.data),
  },
  // 강사 수업 요청 → 매니저 승인/반려(TBO-16 #9). 승인=서버가 createSession 재사용(409+force 동일 규약).
  scheduleRequests: {
    list: (status?: ScheduleRequest["status"], options: ApiReadOptions = {}) =>
      http.get<ScheduleRequestEx[]>("/schedule-requests", { ...options, params: status ? { status } : {} }).then((r) => r.data),
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
  // ── 수업 보고서(TBO-05) — 강사 제출 → 관리자 승인/반려 ──
  reports: {
    list: (sessionId?: number) =>
      http.get<SessionReport[]>("/reports", { params: sessionId ? { sessionId } : undefined }).then((r) => r.data),
    create: (body: { sessionId: number; studentId: number; instructorId?: number; content: string; homework?: string; status?: "draft" | "submitted" }) =>
      http.post<SessionReport>("/reports", body).then((r) => r.data),
    // [E0.6 H1] 기존 보고서 본문/숙제 수정(임시 저장) — 승인 전까지, 본인 보고서만.
    update: (id: number, body: { content?: string; homework?: string }) =>
      http.patch<SessionReport>(`/reports/${id}`, body).then((r) => r.data),
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
    // [B9 E5 2026-07-16] 지급 회수(paid → rejected+reversedAt) + 원장 반대 분개 — 대표 전용.
    //  사유 필수(서버 DTO MinLength 5 — 미달 시 400).
    reverse: (id: number, reason: string) =>
      http.post<{ payout: PayoutRow; transaction: LedgerTx }>(`/payouts/${id}/reverse`, { reason }).then((r) => r.data),
  },
};
