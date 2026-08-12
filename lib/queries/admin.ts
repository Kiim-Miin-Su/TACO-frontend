"use client";
// 계정·유저/강사 관리·가입 승인·가입/복구 보안·프로필 변경 도메인 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clearSudo, isSudoRequiredError } from '@/lib/sudo'; // [TBO-34 C2-C]
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { invalidateInstructorAggregate, invalidateInstructorContractCommand } from "@/lib/query-cache";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { WEB_ID_MIN } from "@/lib/validation"; // [TBO-31 C2 2026-07-16] 아이디 라이브 체크 최소 길이
import { CATALOG_STALE, detailRetry, useInvalidator } from "./shared";
import type { AuthEventQuery, RoleCapability, SetUserCapabilityInput } from '@kms545487/contracts';

// [TBO-74 C1] 강사 계약은 금액 자산이므로 대표 전용. 백엔드 finance.access와 같은 capability를 사용한다.
export const useInstructorContracts = (instructorId?: number) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.instructorContracts.list(instructorId),
    queryFn: () => api.instructorContracts.list(instructorId),
    enabled: can("finance.access"),
    staleTime: CATALOG_STALE,
  });
};
export const useCreateInstructorContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.instructorContracts.create,
    onSuccess: () => invalidateInstructorContractCommand(queryClient),
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
export const useUpdateInstructorContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; patch: Parameters<typeof api.instructorContracts.update>[1] }) =>
      api.instructorContracts.update(value.id, value.patch),
    onSuccess: () => invalidateInstructorContractCommand(queryClient),
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
// [R-6·C2C-b] 엔티티 변경 이력(audit_log) — ADMIN(토큰 게이트 동반). 세션 상세·승인센터 상세 모달 공용.
//  entity = audit_log.entity 값('class_sessions'·'schedule_requests'·'availability_blocks' 등).
export const useEntityAudit = (entity: string, entityId: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.audit.entity(entity, entityId ?? 0),
    queryFn: () => api.audit.list(entity, entityId as number),
    enabled: can("admin.area") && entityId != null,
  });
};

export const usePendingAccounts = () => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.auth.pending,
    queryFn: () => api.auth.pending(),
    enabled: can("signup.decide"),
  });
};
export const useUsers = (includeTerminated = false) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.users.list(includeTerminated),
    queryFn: () => api.users.list(includeTerminated),
    enabled: can("admin.area"),
    staleTime: CATALOG_STALE,
  });
};
export const useInstructorAdminList = () => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.instructors.list(),
    queryFn: () => api.instructors.list(),
    enabled: can("admin.area"),
    staleTime: CATALOG_STALE,
  });
};
export const useInstructorAdminDetail = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.instructors.detail(id ?? 0),
    queryFn: () => api.instructors.get(id as number),
    enabled: id != null && can("admin.area"),
    retry: detailRetry,
  });
};
// [유저 관리 2026-07-20] 상세 단건(B7 규약 — DetailStates 소비)·대표 직접 수정·직접 등록·재인증.
export const useUser = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.users.detail(id ?? 0), queryFn: () => api.users.detail(id as number), enabled: id != null && can("admin.area") });
};
export const useUserPermissions = (id: number | null) => {
  const { can, scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.users.permissions(id ?? 0),
    queryFn: () => api.users.permissions(id as number),
    enabled: id != null && can('access.manage'),
    staleTime: 0,
    gcTime: 5 * 60_000,
    meta: { accountScope: scope },
  });
};
export const useSetUserPermission = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; capability: RoleCapability; input: SetUserCapabilityInput }) =>
      api.users.setPermission(value.id, value.capability, value.input),
    onSuccess: async (projection) => {
      queryClient.setQueryData(qk.users.permissions(projection.userId), projection);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.users.detail(projection.userId) }),
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
        queryClient.invalidateQueries({ queryKey: qk.audit.all }),
      ]);
    },
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
export const useAuthEvents = (query: AuthEventQuery) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.authEvents.list(query),
    queryFn: () => api.authEvents.list(query),
    enabled: query.userId != null && can("security.events.read"),
    staleTime: 15_000,
    retry: detailRetry,
  });
};
export const useAdminUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; patch: { name?: string; englishName?: string; phone?: string; email?: string; role?: string } }) => api.users.adminUpdate(v.id, v.patch),
    // 이름·역할 변경은 강사 선택 자원과 담당 스케줄 렌더링에도 전파된다.
    onSuccess: () => invalidateInstructorAggregate(queryClient),
    // [TBO-34 C2-C] 서버 sudo 창 만료(403 SUDO_REQUIRED) → FE 세션 상태 초기화(게이트가 재인증 재출력)
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
export const useTerminateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; reason: string }) => api.users.terminate(value.id, value.reason),
    onSuccess: () => invalidateInstructorAggregate(queryClient),
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
export const useRestoreUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; reason: string }) => api.users.restore(value.id, value.reason),
    onSuccess: () => invalidateInstructorAggregate(queryClient),
    onError: (caught) => { if (isSudoRequiredError(caught)) clearSudo(); },
  });
};
export const useCreateStaffUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.users.createStaff,
    // role=instructor일 수 있으므로 유저 목록만 갱신하지 않고 수업·스케줄·정산까지 같은 경계를 사용한다.
    onSuccess: () => invalidateInstructorAggregate(queryClient),
  });
};
export const useCreateInstructor = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.instructors.create, onSuccess: () => invalidateInstructorAggregate(queryClient) });
};
export const useUpdateInstructor = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; patch: Parameters<typeof api.instructors.update>[1] }) =>
      api.instructors.update(value.id, value.patch),
    onSuccess: () => invalidateInstructorAggregate(queryClient),
  });
};
export const useRemoveInstructor = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.instructors.remove, onSuccess: () => invalidateInstructorAggregate(queryClient) });
};
export const useReauth = () => useMutation({ mutationFn: api.auth.reauth });
export const useMyProfile = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.profile.me(scope), queryFn: () => api.account.profile() });
};
// [E0.5 ④] 국가·시간대 카탈로그 — 참조 데이터라 세션 내 재조회 불필요(CATALOG_STALE).
export const useCountries = () =>
  useQuery({ queryKey: qk.catalog.countries(), queryFn: () => api.catalog.countries(), staleTime: CATALOG_STALE });
export const useMyProfileChangeRequests = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.profileChangeRequests.mine(scope), queryFn: () => api.profileChangeRequests.mine() });
};
export const useProfileChangeRequests = () => {
  const { scope, can } = useAccountAccess();
  return useQuery({ queryKey: qk.profileChangeRequests.list(scope), queryFn: () => api.profileChangeRequests.list(), enabled: can("approval.manage") });
};
export const useProfileChangeRequest = (id: number | null) => {
  const { scope, can } = useAccountAccess();
  return useQuery({
    queryKey: qk.profileChangeRequests.detail(id ?? 0, scope),
    queryFn: () => api.profileChangeRequests.get(id as number),
    enabled: can("approval.manage") && id != null,
  });
};

export const useApprovePendingAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; reason?: string }) => api.auth.approve(value.id, value.reason),
    // 승인 역할에 따라 강사 aggregate가 생기므로 수업 기본 페이·캘린더·정산을 같은 helper로 갱신한다.
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.auth.pending, refetchType: "active" }),
      invalidateInstructorAggregate(queryClient),
    ]),
  });
};
// [핫픽스 2026-07-20 ①] 레거시 pending 계정 인증 메일 재발송(대표) — 목록 갱신 불요(토큰만 갱신).
export const useResendPendingVerification = () =>
  useMutation({ mutationFn: (id: number) => api.auth.resendPendingVerification(id) });
// [핫픽스 2026-07-20] 가입 신청 삭제 — 식별자 해제·RRN 파기(BE). 목록 즉시 갱신.
export const useDeletePendingAccount = () => {
  const invalidate = useInvalidator([qk.auth.pending, qk.users.all]); // [07-20] 유저 관리 탭도 즉시 갱신
  return useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.auth.deletePendingAccount(v.id, v.reason),
    onSuccess: invalidate,
  });
};
export const useRejectPendingAccount = () =>
  useMutation({
    mutationFn: (value: { id: number; reason: string }) => api.auth.reject(value.id, value.reason),
    onSuccess: useInvalidator([qk.auth.pending, qk.users.all, qk.instructors.all]),
  });

// [E0.5 ①] 대표(super_admin)는 서버가 같은 tx에서 즉시 적용(approved 응답) — 프로필 쿼리도 무효화.
export const useCreateProfileChangeRequest = () =>
  useMutation({ mutationFn: api.profileChangeRequests.create, onSuccess: useInvalidator([qk.profileChangeRequests.all, qk.profile.all]) });
export const useWithdrawProfileChangeRequest = () =>
  useMutation({
    mutationFn: api.profileChangeRequests.withdraw,
    onSuccess: useInvalidator([qk.profileChangeRequests.all]),
  });

// ── [TBO-31 C2/C3 2026-07-16] 가입·계정 보안 강화 훅 ──
// 가입 신청(공개) — 성공 시 로그인 전이라 무효화 대상 캐시 없음(완료 화면 전환은 호출부).
export const useSignup = () => useMutation({ mutationFn: api.auth.signup });
// 가입 전 이메일 OTP(공개) — challenge는 폼-로컬 상태(서버 GET 없음)라 무효화 없음.
export const useCreateSignupEmailChallenge = () => useMutation({ mutationFn: api.auth.signupEmailChallenge });
export const useConfirmSignupEmailChallenge = () =>
  useMutation({ mutationFn: (v: { id: number; email: string; code: string }) => api.auth.confirmSignupEmailChallenge(v.id, v.email, v.code) });
// [TBO-57] 가입 전 휴대전화 OTP — challenge는 폼-로컬 상태(서버 GET 없음)라 무효화 없음.
export const useCreateSignupPhoneChallenge = () => useMutation({ mutationFn: api.auth.signupPhoneChallenge });
export const useConfirmSignupPhoneChallenge = () =>
  useMutation({ mutationFn: (v: { id: number; phone: string; code: string }) => api.auth.confirmSignupPhoneChallenge(v.id, v.phone, v.code) });
// [TBO-57] 가입 폼 구성(공개 — 로그인 불요) — 휴대전화 인증 필수 여부. BE required()와 같은 판정을
//  스테퍼 표시·submit 게이트가 소비한다(단일 진실원). 실패 시엔 서버 400이 최종 방어라 UI는 관대.
export const useSignupConfig = () =>
  useQuery({ queryKey: qk.auth.signupConfig, queryFn: () => api.auth.signupConfig(), staleTime: 60_000, retry: 1 });
// 마이 페이지 '비밀번호 재설정 메일 받기' — 본인 webId+email로 공개 복구 엔드포인트 호출
//  (응답은 계정 존재와 무관하게 동일 문구 — 열거 방지 규약 그대로, 캐시 무효화 없음).
export const useRequestPasswordReset = () =>
  useMutation({ mutationFn: (v: { webId: string; email: string }) => api.auth.recoverPassword(v.webId, v.email) });
// [TBO-31 C5 2026-07-20] 비로그인 복구 OTP판 — challenge는 폼-로컬 상태(서버 GET 없음)라 무효화 없음.
export const useCreateRecoveryEmailChallenge = () => useMutation({ mutationFn: api.auth.recoveryEmailChallenge });
export const useConfirmRecoveryEmailChallenge = () =>
  useMutation({ mutationFn: (v: { id: number; email: string; code: string }) => api.auth.confirmRecoveryEmailChallenge(v.id, v.email, v.code) });
export const useCompleteRecoverId = () =>
  useMutation({ mutationFn: (v: { challengeId: number; email: string }) => api.auth.recoverIdComplete(v.challengeId, v.email) });
export const useResetPasswordOtp = () =>
  useMutation({ mutationFn: (v: { challengeId: number; webId: string; email: string; newPassword: string }) => api.auth.resetPasswordOtp(v.challengeId, v.webId, v.email, v.newPassword) });
// 아이디 가용성 라이브 체크(가입 폼·공개) — 429/400은 조용히 무시(retry 없음), 권위는 submit 시 서버.
export const useWebIdAvailable = (webId: string | null) =>
  useQuery({
    queryKey: qk.auth.webIdAvailable(webId ?? ""),
    queryFn: () => api.auth.webIdAvailable(webId as string),
    enabled: webId != null && webId.trim().length >= WEB_ID_MIN,
    retry: false,
    staleTime: 30_000,
  });
// 대표 아이디 변경 라이브 체크(STAFF 전용 /users/exists — TBO-31에서 dead API에 첫 소비자).
export const useWebIdExists = (webId: string | null) =>
  useQuery({
    queryKey: qk.users.exists(webId ?? ""),
    queryFn: () => api.users.exists(webId as string),
    enabled: webId != null && webId.trim().length >= WEB_ID_MIN,
    retry: false,
    staleTime: 30_000,
  });

// [TBO-29B-4] 연락처 인증 challenge — 서버에 조회(GET)가 없는 모달-로컬 상태라 무효화 대상 쿼리 없음.
export const useCreateProfileVerification = () => useMutation({ mutationFn: api.profileVerifications.create });
export const useConfirmProfileVerification = () =>
  useMutation({ mutationFn: (v: { id: number; code: string }) => api.profileVerifications.confirm(v.id, v.code) });
export const useResendProfileVerification = () => useMutation({ mutationFn: api.profileVerifications.resend });
// [B6 C2] 자격증명 변경(아이디/비밀번호 ± 첫 로그인 프로필) — 성공 시 화면이 전체 로그아웃 정리
//  (clearToken + queryClient.clear + resetPreferences)를 수행하므로 개별 무효화는 없음.
export const useChangeCredentials = () => useMutation({ mutationFn: api.account.changeCredentials });

const profileDecisionKeys = [
  qk.profileChangeRequests.all,
  qk.profile.all,
  qk.users.all,
  qk.instructors.all,
  qk.schedule.all,
];
export const useApproveProfileChangeRequest = () =>
  useMutation({ mutationFn: api.profileChangeRequests.approve, onSuccess: useInvalidator(profileDecisionKeys) });
export const useRejectProfileChangeRequest = () =>
  useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.profileChangeRequests.reject(v.id, v.reason),
    onSuccess: useInvalidator(profileDecisionKeys),
  });
