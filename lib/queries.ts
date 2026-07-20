// [참조/처리] 서버 상태 단일 소스 = TanStack Query. 도메인별 읽기 훅을 여기 모아
//  뷰가 store(zustand) 대신 이 훅으로 서버 데이터를 구독한다(실서비스 패턴).
//  - 쓰기(useMutation)는 Q3에서 도메인별로 추가하며 성공 시 관련 queryKey를 invalidate한다.
//  - buildTasks/navBadges/lib.reports 등 "여러 도메인 slice"가 필요한 로직은 useAppData()로 조립해 넘긴다.
"use client";
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import {
  invalidateCalendarCommand,
  invalidateScheduleRequests,
  refreshScheduleRequestLifecycle,
  scheduleRequestListKey,
  upsertScheduleRequestCache,
} from "@/lib/query-cache";
import { canAccessFinance } from "@/lib/roles";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { WEB_ID_MIN } from "@/lib/validation"; // [TBO-31 C2 2026-07-16] 아이디 라이브 체크 최소 길이
import type { Instructor, SessionReport } from "@/types";
import { useState } from "react";

// Query scope와 enabled는 AppShell의 권위 `/auth/me` 검증을 통과한 currentAccount 한 곳에서 파생한다.
// 쿠키 decode와 Zustand 기본 역할을 각각 재검사하던 이중 권한 판정은 제거했다.

// 백엔드 보고서(status=draft|submitted|sent, approvalStatus=draft|submitted|approved|rejected)를 store 모델로 정규화.
//  구형 응답 호환: approvalStatus가 없으면 status를 승인상태로 해석한다.
export function toStoreReport(r: ApiReport): SessionReport {
  const approvalStatus = r.approvalStatus ?? (r.status === "sent" ? "approved" : r.status);
  const status: SessionReport["status"] =
    approvalStatus === "approved" ? "sent" : approvalStatus === "rejected" ? "draft" : r.status;
  return {
    id: r.id, sessionId: r.sessionId, studentId: r.studentId, instructorId: r.instructorId,
    subjectId: r.subjectId, content: r.content, homework: r.homework,
    status, approvalStatus,
    submittedAt: r.submittedAt, approvedAt: r.approvedAt, approvedBy: r.approvedBy,
    rejectedReason: r.rejectedReason,
  };
}

// ── 도메인 읽기 훅 (뷰는 { data = [] } 형태로 구독) ──
// [감사 M10] 준정적 카탈로그(과목·코스·강의실·학생·보호자)는 staleTime 5분 — 변경 빈도가 낮고
//  쓰기 훅이 invalidate로 즉시 갱신하므로 안전. 나머지는 전역 기본(30s, app/providers.tsx).
const CATALOG_STALE = 5 * 60 * 1000;
export const useStudents = () => useQuery({ queryKey: qk.students.list(), queryFn: () => api.students.list(), staleTime: CATALOG_STALE });
export const useParents = () => useQuery({ queryKey: qk.parents.list(), queryFn: () => api.parents.list(), staleTime: CATALOG_STALE });
export const useParentStudents = () => useQuery({ queryKey: qk.parents.relations(), queryFn: () => api.parents.relations(), staleTime: CATALOG_STALE });
export const useSubjects = () => useQuery({ queryKey: qk.subjects.list(), queryFn: () => api.subjects.list(), staleTime: CATALOG_STALE });
export const useCourses = () => useQuery({ queryKey: qk.courses.list(), queryFn: () => api.courses.list(), staleTime: CATALOG_STALE });
export const useEnrollments = () => useQuery({ queryKey: qk.enrollments.list(), queryFn: () => api.enrollments.list(), staleTime: CATALOG_STALE });
export const useSchedule = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.list({}, scope), queryFn: ({ signal }) => api.schedule.list({}, { signal }) });
};
// [TBO-14] 캘린더 데이터층 — 기간·선택자원 파라미터 스케줄 조회. qk.schedule 하위키라 세션 변경(PATCH/생성/삭제·
//  강사출결)이 qk.schedule.all 무효화로 자동 반영(M1 invalidate 단절 해소). 뷰는 이 데이터를 rows로 feed.
export const useCalendarSchedule = (params: { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number }) => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.list(params, scope), queryFn: ({ signal }) => api.schedule.list(params, { signal }) });
};
// [TBO-14 C2] 캘린더 준정적 카탈로그 — 강의실·자원 피커. staleTime 5분(변경 빈도 낮음·쓰기 시 invalidate).
export const useRooms = () => useQuery({ queryKey: qk.rooms.all(), queryFn: () => api.rooms.list(), staleTime: CATALOG_STALE });
export const useScheduleResources = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.resources(scope), queryFn: ({ signal }) => api.schedule.resources({ signal }), staleTime: CATALOG_STALE });
};
// [TBO-14 C2b] 전체 가용/불가 블록 — 캘린더 밴드 단일 소스(selBlocks는 뷰에서 owner 파생). 밴드 편집 시 invalidate.
export const useAllAvailability = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.availability.everything(scope), queryFn: ({ signal }) => api.availability.all({ signal }) });
};
export const useAttendance = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.attendance.list(scope), queryFn: ({ signal }) => api.attendance.list({ signal }) });
};
export const usePayments = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list(), enabled: can("finance.access") });
};
export const useTransactions = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.transactions.list(), queryFn: () => api.transactions.list(), enabled: can("finance.access") });
};
export const useExpenses = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list(), enabled: can("finance.access") });
};
// [TBO-21 RBAC] 정산 전체 조회는 대표 전용(403) — 비대표는 fetch 비활성(403 재시도 노이즈 방지)
export const usePayouts = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list(), enabled: can("finance.access") });
};
export const useMyPayouts = () => {
  const { scope, can } = useAccountAccess();
  return useQuery({ queryKey: qk.payouts.mine(scope), queryFn: () => api.payouts.mine(), enabled: can("instructor.self") });
};
// [상태 무결성 2026-07-06] 산정 미리보기(읽기전용) — 강사·기간 키 캐시(PayoutsView 로컬 fetch 대체).
//  mutation 성공 시 qk.payouts.all 무효화가 preview 키도 접두사로 포함 → 자동 재계산.
export const usePayoutPreview = (instructorId: number | null, from: string, to: string) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.payouts.preview(instructorId ?? 0, from, to),
    queryFn: () => api.payouts.preview(instructorId as number, from, to),
    enabled: can("finance.access") && instructorId != null && !!from && !!to,
  });
};
export const useMyPayoutPreview = (from: string, to: string) => {
  const { scope, can } = useAccountAccess();
  return useQuery({
    queryKey: qk.payouts.previewMine(scope, from, to),
    queryFn: () => api.payouts.previewMine(from, to),
    enabled: can("instructor.self") && !!from && !!to,
  });
};
// [TBO-16 #9] 수업 요청 — 승인센터·배지(tasks)·캘린더가 **같은 queryKey를 구독**(단일 이벤트 객체).
//  서버가 역할별 스코프 적용(강사=본인 요청만) — 클라 필터 불요.
export const useScheduleRequests = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: scheduleRequestListKey(scope), queryFn: ({ signal }) => api.scheduleRequests.list(undefined, { signal }) });
};
export const useCounselForms = () => useQuery({ queryKey: qk.counsel.forms(), queryFn: () => api.counsel.forms() });
export const useCounselRounds = () => useQuery({ queryKey: qk.counsel.rounds(), queryFn: () => api.counsel.rounds() });
export const useAcademyEvents = () => useQuery({ queryKey: qk.events.list(), queryFn: () => api.events.list() });
// [TBO-19 Sprint4] 강사 계약(매니저 전용 — 계약 대비 실제 시수). 백엔드 GET이 ADMIN 게이트라 비관리자는 비활성.
export const useInstructorContracts = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: ["instructor-contracts", "list"] as const, queryFn: () => api.instructorContracts.list(), enabled: can("admin.area"), staleTime: CATALOG_STALE });
};
// [강사 출결 상세] 특정 강사의 기간 세션 — **권위 소스 /schedule 서버 필터**(instructorId·from·to). 참조 무결성:
//  세션 데이터를 복제하지 않고 단일 소스에서 조회, qk.schedule 하위 키라 세션 변경 시 자동 무효화.
export const useInstructorSessions = (instructorId: number | null, from?: string, to?: string) => {
  const { scope, can } = useAccountAccess();
  return useQuery({
    queryKey: qk.schedule.list({ instructorId: instructorId ?? undefined, from, to }, scope),
    queryFn: () => api.schedule.list({ instructorId: instructorId as number, from, to }),
    enabled: can("admin.area") && instructorId != null && !!from && !!to,
  });
};
// [R-6·C2C-b] 엔티티 변경 이력(audit_log) — ADMIN(토큰 게이트 동반). 세션 상세·승인센터 상세 모달 공용.
//  entity = audit_log.entity 값('class_sessions'·'schedule_requests'·'availability_blocks' 등).
export const useEntityAudit = (entity: string, entityId: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: ["audit", entity, entityId ?? 0] as const,
    queryFn: () => api.audit.list(entity, entityId as number),
    enabled: can("admin.area") && entityId != null,
  });
};
// [R-6] 세션 변경 이력 — entity='class_sessions' 별칭(기존 소비처 유지, 단일 구현=useEntityAudit).
export const useSessionAudit = (sessionId: number | null) => useEntityAudit("class_sessions", sessionId);
// [TBO-19] 강사 출결 현황 집계(관리자 대시보드) — 기간·강사 필터. 서버 집계(DB 이관 시 GROUP BY 승격).
export const useInstructorAttendanceSummary = (from?: string, to?: string, instructorId?: number) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: ["instructor-attendance-summary", from ?? null, to ?? null, instructorId ?? null] as const,
    queryFn: () => api.schedule.instructorAttendanceSummary(from, to, instructorId),
    enabled: can("admin.area") && !!from && !!to,
  });
};
export const useRoadmaps = () => useQuery({ queryKey: qk.roadmaps.list(), queryFn: () => api.roadmaps.list() });
export const useRoadmapCourses = () => useQuery({ queryKey: qk.roadmaps.courses(), queryFn: () => api.roadmaps.courses() });
export const usePendingAccounts = () => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.auth.pending,
    queryFn: () => api.auth.pending(),
    enabled: can("signup.decide"),
  });
};
export const useUsers = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.users.list(), queryFn: () => api.users.list(), enabled: can("admin.area"), staleTime: CATALOG_STALE });
};
// [유저 관리 2026-07-20] 상세 단건(B7 규약 — DetailStates 소비)·대표 직접 수정·직접 등록·재인증.
export const useUser = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.users.detail(id ?? 0), queryFn: () => api.users.detail(id as number), enabled: id != null && can("admin.area") });
};
export const useAdminUpdateUser = () => {
  const invalidate = useInvalidator([qk.users.all]);
  return useMutation({
    mutationFn: (v: { id: number; patch: { name?: string; phone?: string; email?: string; role?: string } }) => api.users.adminUpdate(v.id, v.patch),
    onSuccess: invalidate,
  });
};
export const useCreateStaffUser = () => {
  const invalidate = useInvalidator([qk.users.all]);
  return useMutation({ mutationFn: api.users.createStaff, onSuccess: invalidate });
};
export const useReauth = () => useMutation({ mutationFn: api.auth.reauth });
export const useMyProfile = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.profile.me(scope), queryFn: () => api.account.profile() });
};
// [E0.5 ④] 국가·시간대 카탈로그 — 참조 데이터라 세션 내 재조회 불필요(CATALOG_STALE).
// [B3 2026-07-16] 알림 뱃지 읽음 — 탭별 last-seen(서버 영속). 마킹 성공 시 맵 무효화.
export const useNavSeen = () =>
  useQuery({ queryKey: qk.navSeen.all, queryFn: () => api.navSeen.list(), staleTime: 15_000 });
export const useMarkNavSeen = () =>
  useMutation({ mutationFn: (navKey: string) => api.navSeen.mark(navKey), onSuccess: useInvalidator([qk.navSeen.all]) });

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

// ── [B7 E3] 상세 단건 훅 — full-list 후 클라 find 대체. 404/403은 axios 에러로 흘러
//  DetailStates가 구분 렌더한다. 규약: 404/403은 최종 상태라 재시도하지 않음(무의미한 재요청 차단).
//  키는 도메인 루트 하위 — 기존 쓰기 훅의 .all 루트 무효화가 상세도 자동 갱신(별도 배선 불요).
const detailRetry = (failureCount: number, error: unknown) => {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404 || status === 403) return false;
  return failureCount < 2;
};
export const useStudent = (id: number | null) =>
  useQuery({ queryKey: qk.students.detail(id ?? 0), queryFn: () => api.students.get(id as number), enabled: id != null, retry: detailRetry });
export const useScheduleSession = (id: number | null) => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.detail(id ?? 0, scope), queryFn: () => api.schedule.get(id as number), enabled: id != null, retry: detailRetry });
};
export const useCounselForm = (id: number | null) =>
  useQuery({ queryKey: qk.counsel.form(id ?? 0), queryFn: () => api.counsel.get(id as number), enabled: id != null, retry: detailRetry });
export const usePayment = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payments.detail(id ?? 0), queryFn: () => api.payments.get(id as number), enabled: can("finance.access") && id != null, retry: detailRetry });
};
export const useExpense = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.expenses.detail(id ?? 0), queryFn: () => api.expenses.get(id as number), enabled: can("finance.access") && id != null, retry: detailRetry });
};
export const useCourse = (id: number | null) =>
  useQuery({ queryKey: qk.courses.detail(id ?? 0), queryFn: () => api.courses.get(id as number), enabled: id != null, retry: detailRetry });

// 보고서는 store 모델로 매핑해서 반환(배지·리포트 화면이 store 형상 사용).
export const useReports = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.reports.list(undefined, scope), queryFn: async () => (await api.reports.list()).map(toStoreReport) });
};

// 강사 목록 = 스케줄 자원(resources)에서 파생(단일 소스). store.instructors 대체.
export const useInstructors = () => {
  const { scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.schedule.resources(scope),
    queryFn: ({ signal }) => api.schedule.resources({ signal }),
    select: (res): Instructor[] => res.instructors.map((i) => ({ id: i.id, name: i.name, subjectName: i.sub })),
    staleTime: CATALOG_STALE,
  });
};

// 교차 도메인 slice — buildTasks/navBadges/lib.reports가 store 대신 이걸 받는다(전환용 컴포지트).
// 각 배열은 로딩 전 빈 배열(뷰 안전). currentRole은 zustand(클라 상태)에서 별도로 읽는다.
export function useAppData() {
  const { role } = useAccountAccess();
  const students = useStudents().data ?? [];
  const parents = useParents().data ?? [];
  const parentStudents = useParentStudents().data ?? [];
  const subjects = useSubjects().data ?? [];
  const courses = useCourses().data ?? [];
  const enrollments = useEnrollments().data ?? [];
  const classSessions = useSchedule().data ?? [];
  const attendance = useAttendance().data ?? [];
  const sessionReports = useReports().data ?? [];
  const payments = usePayments().data ?? [];
  const transactions = useTransactions().data ?? [];
  const expenses = useExpenses().data ?? [];
  const financePayouts = usePayouts().data ?? [];
  const myPayouts = useMyPayouts().data ?? [];
  const instructorPayouts = canAccessFinance(role) ? financePayouts : role === "instructor" ? myPayouts : [];
  const counselForms = useCounselForms().data ?? [];
  const counselRounds = useCounselRounds().data ?? [];
  const academyEvents = useAcademyEvents().data ?? [];
  const roadmaps = useRoadmaps().data ?? [];
  const roadmapCourses = useRoadmapCourses().data ?? [];
  const instructors = useInstructors().data ?? [];
  const scheduleRequests = useScheduleRequests().data ?? []; // TBO-16 — 배지·승인센터 동일 모집단
  // [핫픽스 2026-07-20 ②] 가입 승인·프로필 변경도 배지/할일 모집단에 — 권한 게이트는 각 훅이 수행
  //  (비대상 역할은 disabled → 빈 배열). 반려 사유 알림용 내 요청(mine)도 함께 구독.
  const pendingAccounts = usePendingAccounts().data ?? [];
  const profileChangeRequests = useProfileChangeRequests().data ?? [];
  const myProfileChangeRequests = useMyProfileChangeRequests().data ?? [];
  return {
    students, parents, parentStudents, subjects, courses, enrollments, classSessions,
    attendance, sessionReports, payments, transactions, expenses, instructorPayouts,
    counselForms, counselRounds, academyEvents, roadmaps, roadmapCourses, instructors,
    scheduleRequests, pendingAccounts, profileChangeRequests, myProfileChangeRequests,
  };
}

// 네비게이션 배지/알림은 buildTasks가 실제 사용하는 도메인만 구독한다.
export function useTaskData() {
  const { role } = useAccountAccess();
  const financePayouts = usePayouts().data ?? [];
  const myPayouts = useMyPayouts().data ?? [];
  return {
    instructors: useInstructors().data ?? [],
    students: useStudents().data ?? [],
    courses: useCourses().data ?? [],
    enrollments: useEnrollments().data ?? [],
    classSessions: useSchedule().data ?? [],
    sessionReports: useReports().data ?? [],
    expenses: useExpenses().data ?? [],
    instructorPayouts: canAccessFinance(role) ? financePayouts : role === "instructor" ? myPayouts : [],
    counselForms: useCounselForms().data ?? [],
    payments: usePayments().data ?? [],
    scheduleRequests: useScheduleRequests().data ?? [],
    // [핫픽스 2026-07-20 ②] 배지·알림에 가입 승인/프로필 변경 포함(권한 게이트는 훅이 수행)
    pendingAccounts: usePendingAccounts().data ?? [],
    profileChangeRequests: useProfileChangeRequests().data ?? [],
    myProfileChangeRequests: useMyProfileChangeRequests().data ?? [],
  };
}

// ── 뮤테이션 훅 (중앙화) ──
// 쓰기는 전부 백엔드 API 경유 + 성공 시 관련 queryKey invalidate → Query(및 store 하이드레이션) 자동 갱신.
// 각 뷰는 아래 훅만 호출(useMutation+invalidate 반복 제거 = 함수 통일).
// [B6 C2/EP5] refetchType "active"로 query-cache 헬퍼와 정책 일원화 — 종전 미지정(all)은 비활성
//  화면의 쿼리까지 즉시 refetch했다. invalidate 표시는 남으므로 비활성 쿼리는 다음 마운트에 재조회.
function useInvalidator(keys: QueryKey[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: key, refetchType: "active" })));
}

// 카탈로그
export const useCreateCourse = () => useMutation({ mutationFn: api.courses.create, onSuccess: useInvalidator([qk.courses.all]) });
export const useCreateSubject = () => useMutation({ mutationFn: api.subjects.create, onSuccess: useInvalidator([qk.subjects.all]) });
export const useCreateEvent = () => useMutation({ mutationFn: api.events.create, onSuccess: useInvalidator([qk.events.all]) });
// [TBO-29D 요구 ⑥] 매니저 이상 — 이벤트 수정/삭제(admin 이벤트 화면 + 캘린더 공통 일정 최신화).
export const useUpdateEvent = () =>
  useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.events.update>[1] }) => api.events.update(v.id, v.patch),
    onSuccess: useInvalidator([qk.events.all]),
  });
export const useRemoveEvent = () => useMutation({ mutationFn: api.events.remove, onSuccess: useInvalidator([qk.events.all]) });
export const useCreateRoadmap = () => useMutation({ mutationFn: api.roadmaps.create, onSuccess: useInvalidator([qk.roadmaps.all]) });
// [B4 2026-07-16] 강의실 관리(매니저 이상) — 성공 시 qk.rooms 무효화로 수업탭 목록·수업 추가 모달 select가 동시 갱신.
export const useCreateRoom = () => useMutation({ mutationFn: api.rooms.create, onSuccess: useInvalidator([qk.rooms.all()]) });
export const useUpdateRoom = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.rooms.update>[1] }) => api.rooms.update(v.id, v.patch), onSuccess: useInvalidator([qk.rooms.all()]) });
export const useRemoveRoom = () => useMutation({ mutationFn: api.rooms.remove, onSuccess: useInvalidator([qk.rooms.all()]) });

export const useApprovePendingAccount = () => {
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (value: { id: number; role?: string }) => api.auth.approve(value.id, value.role),
    // [B6 C2/EP5 P6] 계정 승인이 캘린더에서 바꾸는 것은 강사 리소스 목록뿐 — schedule 전체(all)가 아니라
    //  resources(scope)만 무효화(세션·출결 데이터는 무관).
    onSuccess: useInvalidator([qk.auth.pending, qk.users.all, qk.schedule.resources(scope)]),
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
    onSuccess: useInvalidator([qk.auth.pending, qk.users.all]),
  });

// 명단(학생·수강)
export const useCreateStudent = () => useMutation({ mutationFn: api.students.create, onSuccess: useInvalidator([qk.students.all]) });
// [TBO-29D D2] 원자 등록 — 학생·수강·보호자·관계가 한 tx로 생기므로 관련 캐시를 한 번에 무효화.
export const useRegisterStudent = () =>
  useMutation({
    mutationFn: api.students.register,
    onSuccess: useInvalidator([qk.students.all, qk.enrollments.all, qk.parents.all]),
  });
export const useUpdateStudent = () =>
  useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.students.update>[1] }) => api.students.update(v.id, v.patch),
    // 국가 변경은 캘린더 시차 뷰·스케줄 코호트 표시에 영향 — schedule도 함께 무효화.
    onSuccess: useInvalidator([qk.students.all, qk.schedule.all]),
  });
export const useRemoveStudent = () => useMutation({ mutationFn: api.students.remove, onSuccess: useInvalidator([qk.students.all, qk.enrollments.all]) });
export const useCreateEnrollment = () => useMutation({ mutationFn: api.enrollments.create, onSuccess: useInvalidator([qk.enrollments.all, qk.students.all]) });

// 결제
export const useCreatePayment = () => useMutation({ mutationFn: api.payments.create, onSuccess: useInvalidator([qk.payments.all]) });
export const useUpdatePayment = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.payments.update>[1] }) => api.payments.update(v.id, v.patch), onSuccess: useInvalidator([qk.payments.all]) });
export const useMarkPaymentPaid = () => useMutation({ mutationFn: api.payments.markPaid, onSuccess: useInvalidator([qk.payments.all, qk.transactions.all]) });

// 지출(승인 워크플로우)
export const useCreateExpense = () => useMutation({ mutationFn: api.expenses.create, onSuccess: useInvalidator([qk.expenses.all]) });
export const useApproveExpense = () => useMutation({ mutationFn: api.expenses.approve, onSuccess: useInvalidator([qk.expenses.all, qk.transactions.all]) });
export const useRejectExpense = () =>
  useMutation({
    // 반려 사유 **필수**(Q2 — 서버 DTO @IsNotEmpty와 정합)
    mutationFn: (v: { id: number; reason: string }) => api.expenses.reject(v.id, v.reason),
    onSuccess: useInvalidator([qk.expenses.all]),
  });
export const useRefundPayment = () => useMutation({ mutationFn: api.payments.refund, onSuccess: useInvalidator([qk.payments.all, qk.transactions.all]) });

// ── 자산화 2차(2026-07-03): 뷰 프리셋·리포트 템플릿 — 클라 휘발 → DB 컬렉션 ──
export const useViewPresets = () => useQuery({ queryKey: qk.viewPresets.list(), queryFn: () => api.viewPresets.list(), staleTime: CATALOG_STALE });
export const useCreateViewPreset = () => useMutation({ mutationFn: api.viewPresets.create, onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useUpdateViewPreset = () => useMutation({ mutationFn: (v: { id: number; input: Parameters<typeof api.viewPresets.update>[1] }) => api.viewPresets.update(v.id, v.input), onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useRemoveViewPreset = () => useMutation({ mutationFn: api.viewPresets.remove, onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useReportTemplates = () => useQuery({ queryKey: qk.reportTemplates.list(), queryFn: () => api.reportTemplates.list(), staleTime: CATALOG_STALE });
export const useCreateReportTemplate = () => useMutation({ mutationFn: api.reportTemplates.create, onSuccess: useInvalidator([qk.reportTemplates.all]) });
export const useRemoveReportTemplate = () => useMutation({ mutationFn: api.reportTemplates.remove, onSuccess: useInvalidator([qk.reportTemplates.all]) });

// 상담
export const useCreateCounsel = () => useMutation({ mutationFn: api.counsel.create, onSuccess: useInvalidator([qk.counsel.all]) });
export const useUpdateCounsel = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.counsel.update>[1] }) => api.counsel.update(v.id, v.patch), onSuccess: useInvalidator([qk.counsel.all]) });
export const useCreateCounselRound = () =>
  useMutation({ mutationFn: (v: { formId: number; input: Parameters<typeof api.counsel.createRound>[1] }) => api.counsel.createRound(v.formId, v.input), onSuccess: useInvalidator([qk.counsel.all]) });

// [B6 C4/EP9] 가용/불가 블록 쓰기 — ScheduleCalendar 수동 api.availability.* 잔재의 중앙 훅화.
//  무효화는 availability.all만(EP5 — 블록은 세션·출결·리포트·정산 데이터와 무관, 종전
//  reloadSelBlocks=invalidate(qk.availability.all)와 동일 범위. 승인 필요 409 처리는 호출부 소관).
export const useUpsertAvailability = () =>
  useMutation({ mutationFn: api.availability.upsert, onSuccess: useInvalidator([qk.availability.all]) });
export const useRemoveAvailability = () =>
  useMutation({ mutationFn: api.availability.remove, onSuccess: useInvalidator([qk.availability.all]) });

// 스케줄(생성·수정·삭제) — [C4] 캘린더 명령 무효화 단일 소스(invalidateCalendarCommand)로 통일.
const useCalendarCommandInvalidator = () => {
  const qc = useQueryClient();
  return () => invalidateCalendarCommand(qc);
};
export const useCreateSchedule = () => useMutation({ mutationFn: api.schedule.create, onSuccess: useCalendarCommandInvalidator() });
export const useCreateScheduleSeries = () => useMutation({ mutationFn: api.schedule.createSeries, onSuccess: useCalendarCommandInvalidator() }); // [C2/C4] 반복 bulk
export type AccountingImpactPrompt = {
  payoutLocked: boolean;
  impact: {
    before: { teachingMinutes: number; computedAmount: number };
    after: { teachingMinutes: number; computedAmount: number };
    delta: { teachingMinutes: number; computedAmount: number };
  };
};

export const useUpdateSchedule = () => {
  type Variables = { id: number; body: Parameters<typeof api.schedule.update>[1] };
  const [pending, setPending] = useState<{ variables: Variables; prompt: AccountingImpactPrompt } | null>(null);
  const mutation = useMutation({
    mutationFn: (v: Variables) => api.schedule.update(v.id, v.body),
    onSuccess: useCalendarCommandInvalidator(), // [C4] 단일 무효화 — 시수·정산 미리보기 동시 재계산
  });
  const mutate: typeof mutation.mutate = (variables, options) => mutation.mutate(variables, {
    ...options,
    onError: (error, vars, onMutateResult, context) => {
      const data = (error as { response?: { data?: { code?: string; impact?: AccountingImpactPrompt['impact'] } } }).response?.data;
      if (data?.impact && (data.code === 'ACCOUNTING_IMPACT_ACK_REQUIRED' || data.code === 'PAYOUT_REVERSAL_REQUIRED')) {
        setPending({ variables, prompt: { impact: data.impact, payoutLocked: data.code === 'PAYOUT_REVERSAL_REQUIRED' } });
        return;
      }
      options?.onError?.(error, vars, onMutateResult, context);
    },
  });
  return {
    ...mutation,
    mutate,
    accountingPrompt: pending?.prompt ?? null,
    dismissAccountingPrompt: () => setPending(null),
    confirmAccountingImpact: () => {
      if (!pending) return;
      const { variables, prompt } = pending;
      setPending(null);
      if (!prompt.payoutLocked)
        mutation.mutate({ ...variables, body: { ...variables.body, acknowledgeAccountingImpact: true } });
    },
  };
};
export const useRemoveSchedule = () =>
  useMutation({
    // [TBO-29C C3] scope/CAS 인자와 TanStack context 인자 충돌 방지 — 명시 래핑
    mutationFn: (vars: { id: number; scope?: "this" | "this_and_following" | "all"; expectedSeriesVersion?: number }) =>
      api.schedule.remove(vars.id, vars.scope || vars.expectedSeriesVersion != null ? { scope: vars.scope, expectedSeriesVersion: vars.expectedSeriesVersion } : undefined),
    onSuccess: useCalendarCommandInvalidator(), // [C4] 단일 무효화
  });

// 수업 요청(TBO-16 #9) — 승인 시 세션이 생기므로 schedule도 무효화(참조 무결성 — 캘린더·배지 동시 갱신)
export const useCreateScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: api.scheduleRequests.create,
    onSuccess: (data) => {
      upsertScheduleRequestCache(qc, scope, data.row);
      return invalidateScheduleRequests(qc);
    },
  });
};
export const useApproveScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: { id: number; force?: boolean }) => api.scheduleRequests.approve(v.id, v.force),
    // [C2C-b] audit 프리픽스 무효화 — 상세 모달 '처리 이력'이 승인 직후 즉시 갱신
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data.request);
      const kind = data.request.requestKind;
      await refreshScheduleRequestLifecycle(qc, {
        schedule: kind == null || kind === "session_create" || kind === "session_update" || kind === "session_delete",
        availability: kind === "availability_upsert" || kind === "availability_delete",
      });
    },
  });
};
export const useRejectScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.scheduleRequests.reject(v.id, v.reason), // 사유 필수
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data);
      await refreshScheduleRequestLifecycle(qc);
    },
  });
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 상세 모달 편집. 승인센터·배지·캘린더 고스트 동시 갱신
export const useUpdateScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof api.scheduleRequests.update>[1] }) => api.scheduleRequests.update(v.id, v.body),
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data);
      await refreshScheduleRequestLifecycle(qc);
    }, // 이력 즉시 갱신(상세 모달)
  });
};
export const useWithdrawScheduleRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.scheduleRequests.withdraw,
    onSuccess: async () => {
      await refreshScheduleRequestLifecycle(qc);
    },
  });
};

// 출결(강사 마킹) — session×student upsert
export const useUpsertAttendance = () => useMutation({ mutationFn: api.attendance.upsert, onSuccess: useInvalidator([qk.attendance.all]) });

// 리포트(작성·제출·승인/반려) — 승인은 시수/정산 적격 변동
export const useCreateReport = () => useMutation({ mutationFn: api.reports.create, onSuccess: useInvalidator([qk.reports.all]) });
// [E0.6 H1] 기존 보고서 임시 저장(본문/숙제 수정) — 승인 전까지.
export const useUpdateReport = () =>
  useMutation({ mutationFn: (v: { id: number; content?: string; homework?: string }) => api.reports.update(v.id, v), onSuccess: useInvalidator([qk.reports.all]) });
export const useSubmitReport = () => useMutation({ mutationFn: api.reports.submit, onSuccess: useInvalidator([qk.reports.all]) });
export const useApproveReport = () =>
  useMutation({ mutationFn: (v: { id: number; approvedBy?: number }) => api.reports.approve(v.id, v.approvedBy), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all]) });
export const useRejectReport = () =>
  useMutation({ mutationFn: (v: { id: number; reason?: string }) => api.reports.reject(v.id, v.reason), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all]) });

// 정산(강사 페이) — 생성/확정/지급/반려/조정
export const useGeneratePayout = () =>
  useMutation({ mutationFn: (v: { instructorId: number; from: string; to: string }) => api.payouts.generate(v.instructorId, v.from, v.to), onSuccess: useInvalidator([qk.payouts.all]) });
export const useConfirmPayout = () => useMutation({ mutationFn: api.payouts.confirm, onSuccess: useInvalidator([qk.payouts.all]) });
export const usePayPayout = () => useMutation({ mutationFn: api.payouts.pay, onSuccess: useInvalidator([qk.payouts.all, qk.transactions.all]) });
export const useRejectPayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason?: string }) => api.payouts.reject(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all]) });
// [B9 E5 2026-07-16] 지급 회수(paid → rejected+reversedAt) — 원장 반대 분개(transactions) 반영 +
//  세션 잠금 해제가 캘린더 편집 가능성에 반영(useRejectPayout과 동일 근거로 schedule도 무효화).
export const useReversePayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason: string }) => api.payouts.reverse(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.transactions.all, qk.schedule.all]) });
export const useAdjustPayout = () =>
  useMutation({ mutationFn: (v: { id: number; amount: number; reason?: string }) => api.payouts.adjust(v.id, v.amount, v.reason), onSuccess: useInvalidator([qk.payouts.all]) });

// [E0.5 ①] 대표(super_admin)는 서버가 같은 tx에서 즉시 적용(approved 응답) — 프로필 쿼리도 무효화.
export const useCreateProfileChangeRequest = () =>
  useMutation({ mutationFn: api.profileChangeRequests.create, onSuccess: useInvalidator([qk.profileChangeRequests.all, qk.profile.all]) });

// ── [TBO-31 C2/C3 2026-07-16] 가입·계정 보안 강화 훅 ──
// 가입 신청(공개) — 성공 시 로그인 전이라 무효화 대상 캐시 없음(완료 화면 전환은 호출부).
export const useSignup = () => useMutation({ mutationFn: api.auth.signup });
// 가입 전 이메일 OTP(공개) — challenge는 폼-로컬 상태(서버 GET 없음)라 무효화 없음.
export const useCreateSignupEmailChallenge = () => useMutation({ mutationFn: api.auth.signupEmailChallenge });
export const useConfirmSignupEmailChallenge = () =>
  useMutation({ mutationFn: (v: { id: number; email: string; code: string }) => api.auth.confirmSignupEmailChallenge(v.id, v.email, v.code) });
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

const profileDecisionKeys = [qk.profileChangeRequests.all, qk.profile.all, qk.users.all, qk.schedule.all];
export const useApproveProfileChangeRequest = () =>
  useMutation({ mutationFn: api.profileChangeRequests.approve, onSuccess: useInvalidator(profileDecisionKeys) });
export const useRejectProfileChangeRequest = () =>
  useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.profileChangeRequests.reject(v.id, v.reason),
    onSuccess: useInvalidator(profileDecisionKeys),
  });
