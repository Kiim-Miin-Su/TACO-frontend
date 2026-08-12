// 인증·계정·유저·프로필 변경/인증 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type {
  DeletedResult,
  StaffAccountDetail,
  Country,
  CreateProfileChangeRequestInput,
  ProfileChangeFields,
  ProfileChangeRequest,
  AuthEventQuery,
  AuthEventRecord,
  PendingStaffAccount,
  StaffAccountSummary,
  StaffLoginResult,
  StaffProfile,
  StaffSignupResult,
  WebIdCheckResult,
  RoleCapability,
  SetUserCapabilityInput,
  UserPermissionsProjection,
} from "@kms545487/contracts";
export type { ProfileChangeFields, ProfileChangeRequest } from "@kms545487/contracts";

export type LoginBody = { webId: string; password?: string };
export type LoginResult = StaffLoginResult;
// [E0.5 ⑥] name/email/phone은 첫 로그인 강제 변경(must_change_password)에서만 서버가 허용 —
//  평시 프로필 변경은 마이 페이지 인증/승인 경로(29B-4)를 지난다.
// [E0] newWebId도 강제 변경 흐름 전용(평시 아이디 변경 = 승인제). 평시 비밀번호 변경은
//  본인 이메일 OTP(verificationChallengeId) 소비 필수.
export type ChangeCredentialsBody = {
  currentPassword: string; newWebId?: string; newPassword?: string;
  name?: string; englishName?: string; email?: string; phone?: string;
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
  webId: string; name: string; englishName: string; email: string; password: string; role?: string;
  rrn: string; emailChallengeId: number;
  // [TBO-57] SENS 설정 시 서버가 필수 강제(signup-config 단일 진실원) — verified challenge id.
  phoneChallengeId?: number;
  phone?: string; university?: string; major?: string;
};
// [TBO-31 C2] devVerifyLink 제거 — OTP 가입은 emailVerified=true 생성이라 인증 링크 단계가 소멸.
export type SignupResult = StaffSignupResult;
// [TBO-31 C2] 가입 전 이메일 OTP challenge(공개) — devOtpCode는 비production+SMTP 부재에서만
//  응답에 실린다(기존 devVerifyLink 관례의 OTP판 — 개발 안내 표기용).
export type SignupEmailChallenge = {
  id: number;
  maskedTarget: string;
  expiresAt: string;
  resendAvailableAt: string;
  devOtpCode?: string;
};
// [TBO-57] 가입 전 휴대전화 OTP — 응답 형상은 이메일판과 동일(공용 OtpChallengeField가 소비).
export type OtpChallenge = SignupEmailChallenge;
// [TBO-57] 가입 폼 구성(공개) — 휴대전화 인증 필수 여부(BE required()와 같은 단일 진실원).
export type SignupConfig = { phoneVerificationRequired: boolean };
export type PendingAccount = PendingStaffAccount;
export type MyProfile = StaffProfile;
// [E0.5 ④] 국가·시간대 카탈로그 행 — BE countries 표(참조 데이터)와 1:1.
// [TBO-79 F1] 소유는 contracts — 손으로 다시 선언하던 사본을 제거했다(flag optional 드리프트 해소).
export type CatalogCountry = Country;
// [TBO-29B-4] 모든 프로필 변경 요청은 현재 비밀번호 재확인 필수. 연락처(email/phone 채움) 변경은
//  verified challenge id를 함께 보내 서버 tx 안에서 일회 소비된다.
export type CreateProfileChangeRequestBody = CreateProfileChangeRequestInput;
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
export type UserProfileSummary = StaffAccountSummary;

export const authAccountApi = {
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
    // [TBO-57] 가입 전 휴대전화 OTP — 발송(5회/분·쿨다운 60초 supersede 재전송)·확인(10회/분·5회 잠금).
    signupPhoneChallenge: (phone: string) =>
      http.post<OtpChallenge>("/auth/signup-phone-challenge", { phone }).then((r) => r.data),
    confirmSignupPhoneChallenge: (id: number, phone: string, code: string) =>
      http.post<{ id: number; status: "verified" }>(`/auth/signup-phone-challenge/${id}/confirm`, { phone, code }).then((r) => r.data),
    // [TBO-57] 가입 폼 구성(공개) — { phoneVerificationRequired } 단일 필드(스테퍼·submit 게이트 공용).
    signupConfig: () => http.get<SignupConfig>("/auth/signup-config").then((r) => r.data),
    // [TBO-31 C2] 아이디 가용성 공개 체크 — {available}만(이름·역할 미노출), 3자 미만 400·10회/분.
    webIdAvailable: (webId: string) =>
      http.get<{ available: boolean }>("/auth/web-id-available", { params: { webId } }).then((r) => r.data),
    // 이메일 인증(메일 링크 token)
    verifyEmail: (token: string) =>
      http.get<{ ok: boolean; message: string }>("/auth/verify-email", { params: { token } }).then((r) => r.data),
    // 토큰 검증(서버에서 claims 반환)
    me: () =>
      http.get<{ sub: number; name: string; englishName: string; roles: string[]; accessVersion: number; effectiveCapabilities: RoleCapability[]; mustChangePassword?: boolean }>("/auth/me").then((r) => r.data),
    // [TBO-28B] 로그아웃 — auth_events 보안 기록(베스트에포트 호출, 토큰 폐기는 클라이언트).
    logout: () => http.post<{ ok: boolean }>("/auth/logout", {}).then((r) => r.data),
    // [유저 관리 2026-07-20] 재인증 게이트 — 민감 화면 진입 전 비밀번호 재확인(5회/분 스로틀).
    reauth: (currentPassword: string) => http.post<{ ok: true }>("/auth/reauth", { currentPassword }).then((r) => r.data),
    // [TBO-29C C5] 비로그인 복구 — 응답은 계정 존재와 무관하게 동일(dev 환경만 devWebId/devResetUrl 노출)
    // [TBO-70] 구판 recoverId(즉발형) 삭제 — OTP판 recoverIdComplete로 대체 후 호출자 0(TBO-69 발견).
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
    // 매니저 이상 — 서버가 요청 역할별 승인·반려 범위를 필터링/강제한다.
    // [TBO-28B] 승인=원자 tx(상태+승인메타+강사프로필+audit, 동시 결정 409) · 반려=사유 필수(400)
    pending: () => http.get<PendingAccount[]>("/auth/pending").then((r) => r.data),
    // [핫픽스 2026-07-20 ①] 레거시 pending 계정(구 링크 가입 — SMTP 부재기 메일 미발송) 인증 메일 재발송.
    // [핫픽스 2026-07-20] 가입 신청 삭제(pending·rejected) — 식별자 해제로 같은 아이디/이메일 재가입 허용.
    deletePendingAccount: (id: number, reason: string) =>
      http.delete<{ ok: boolean }>(`/auth/pending/${id}`, { data: { reason } }).then((r) => r.data),
    resendPendingVerification: (id: number) =>
      http.post<{ ok: boolean; message: string; devVerifyLink?: string }>(`/auth/pending/${id}/resend-verification`, {}).then((r) => r.data),
    approve: (id: number, reason?: string) =>
      http.post<PendingAccount>(`/auth/approve/${id}`, reason ? { reason } : {}).then((r) => r.data),
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
  users: {
    // web id 존재 확인 (등록 폼 "확인하기")
    exists: (webId: string) =>
      http.get<WebIdCheckResult>("/users/exists", { params: { webId } }).then((r) => r.data),
    list: (includeTerminated = false) =>
      http.get<UserProfileSummary[]>("/users", { params: includeTerminated ? { includeTerminated: true } : undefined }).then((r) => r.data),
    // [유저 관리 2026-07-20] 상세 단건(관리자 — super_admin 응답에만 rrnMasked)·대표 직접 수정·직접 등록.
    // [TBO-79 E5] 종전엔 계약이 부족해 `& { rrnMasked?; university?; major?; birthYear? }`를 손으로
    //  덧붙이고 있었다. 계약이 실제 wire와 일치하도록 확장돼 이제 재선언이 필요 없다.
    detail: (id: number) => http.get<StaffAccountDetail>(`/users/${id}`).then((r) => r.data),
    permissions: (id: number) =>
      http.get<UserPermissionsProjection>(`/users/${id}/permissions`).then((r) => r.data),
    setPermission: (id: number, capability: RoleCapability, input: SetUserCapabilityInput) =>
      http.put<UserPermissionsProjection>(`/users/${id}/permissions/${encodeURIComponent(capability)}`, input).then((r) => r.data),
    adminUpdate: (id: number, patch: { name?: string; englishName?: string; phone?: string; email?: string; role?: string }) =>
      http.patch<UserProfileSummary>(`/users/${id}`, patch).then((r) => r.data),
    createStaff: (input: { webId: string; name: string; englishName: string; password: string; role?: string; email?: string; phone?: string; university?: string; major?: string; birthYear?: number }) =>
      http.post<UserProfileSummary>("/users/instructors", input).then((r) => r.data),
    terminate: (id: number, reason: string) =>
      http.delete<UserProfileSummary>(`/users/${id}`, { data: { reason } }).then((r) => r.data),
    restore: (id: number, reason: string) =>
      http.post<UserProfileSummary>(`/users/${id}/restore`, { reason }).then((r) => r.data),
  },
  authEvents: {
    list: (query: AuthEventQuery) =>
      http.get<AuthEventRecord[]>("/auth/events", { params: query }).then((r) => r.data),
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
    withdraw: (id: number) =>
      http.delete<DeletedResult>(`/profile-change-requests/${id}`).then((r) => r.data),
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
};
