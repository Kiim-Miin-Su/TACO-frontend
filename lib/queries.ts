// [참조/처리] 서버 상태 단일 소스 = TanStack Query. 도메인별 읽기 훅을 여기 모아
//  뷰가 store(zustand) 대신 이 훅으로 서버 데이터를 구독한다(실서비스 패턴).
//  - 쓰기(useMutation)는 Q3에서 도메인별로 추가하며 성공 시 관련 queryKey를 invalidate한다.
//  - buildTasks/navBadges/lib.reports 등 "여러 도메인 slice"가 필요한 로직은 useAppData()로 조립해 넘긴다.
"use client";
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import {
  invalidateScheduleRequests,
  refreshScheduleRequestLifecycle,
  scheduleRequestListKey,
  upsertScheduleRequestCache,
} from "@/lib/query-cache";
import { useTacoStore } from "@/lib/store";
import { canAccessFinance, isAdmin } from "@/lib/roles";
import { currentClaims } from "@/lib/auth";
import type { AccountRole, Instructor, SessionReport } from "@/types";
import { useState } from "react";

// [TBO-21 B1] 정산 전체 조회는 대표 전용(403). 스토어 currentRole 기본값('super_admin')이 새로고침 직후
//  JWT 하이드레이트 전에 대표로 잡혀 강사가 /payouts를 호출→403 나던 문제 → **토큰 역할**로 게이트.
//  currentClaims()는 현재 쿠키 토큰을 읽어 실제 로그인 역할을 즉시 반영(서버선 null→비활성, 쿼리는 클라에서만 실행).
const tokenIsAdmin = () => (currentClaims()?.roles ?? []).some((r) => isAdmin(r as AccountRole));
const tokenCanAccessFinance = () => (currentClaims()?.roles ?? []).some((r) => canAccessFinance(r as AccountRole));
const tokenIsInstructor = () => (currentClaims()?.roles ?? []).includes("instructor");
export const tokenScopeKey = () => {
  const c = currentClaims();
  return c ? `${c.sub}:${(c.roles ?? []).join(',')}` : 'anon';
};

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
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.schedule.list({}, scope), queryFn: ({ signal }) => api.schedule.list({}, { signal }) });
};
// [TBO-14] 캘린더 데이터층 — 기간·선택자원 파라미터 스케줄 조회. qk.schedule 하위키라 세션 변경(PATCH/생성/삭제·
//  강사출결)이 qk.schedule.all 무효화로 자동 반영(M1 invalidate 단절 해소). 뷰는 이 데이터를 rows로 feed.
export const useCalendarSchedule = (params: { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number }) => {
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.schedule.list(params, scope), queryFn: ({ signal }) => api.schedule.list(params, { signal }) });
};
// [TBO-14 C2] 캘린더 준정적 카탈로그 — 강의실·자원 피커. staleTime 5분(변경 빈도 낮음·쓰기 시 invalidate).
export const useRooms = () => useQuery({ queryKey: qk.rooms.all(), queryFn: () => api.rooms.list(), staleTime: CATALOG_STALE });
export const useScheduleResources = () => {
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.schedule.resources(scope), queryFn: ({ signal }) => api.schedule.resources({ signal }), staleTime: CATALOG_STALE });
};
// [TBO-14 C2b] 전체 가용/불가 블록 — 캘린더 밴드 단일 소스(selBlocks는 뷰에서 owner 파생). 밴드 편집 시 invalidate.
export const useAllAvailability = () => {
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.availability.everything(scope), queryFn: ({ signal }) => api.availability.all({ signal }) });
};
export const useAttendance = () => {
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.attendance.list(scope), queryFn: ({ signal }) => api.attendance.list({ signal }) });
};
export const usePayments = () => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list(), enabled: canAccessFinance(role) && tokenCanAccessFinance() });
};
export const useTransactions = () => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({ queryKey: qk.transactions.list(), queryFn: () => api.transactions.list(), enabled: canAccessFinance(role) && tokenCanAccessFinance() });
};
export const useExpenses = () => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list(), enabled: canAccessFinance(role) && tokenCanAccessFinance() });
};
// [TBO-21 RBAC] 정산 전체 조회는 대표 전용(403) — 비대표는 fetch 비활성(403 재시도 노이즈 방지)
export const usePayouts = () => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list(), enabled: canAccessFinance(role) && tokenCanAccessFinance() });
};
export const useMyPayouts = () => {
  const scope = tokenScopeKey();
  return useQuery({ queryKey: qk.payouts.mine(scope), queryFn: () => api.payouts.mine(), enabled: tokenIsInstructor() });
};
// [상태 무결성 2026-07-06] 산정 미리보기(읽기전용) — 강사·기간 키 캐시(PayoutsView 로컬 fetch 대체).
//  mutation 성공 시 qk.payouts.all 무효화가 preview 키도 접두사로 포함 → 자동 재계산.
export const usePayoutPreview = (instructorId: number | null, from: string, to: string) => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({
    queryKey: qk.payouts.preview(instructorId ?? 0, from, to),
    queryFn: () => api.payouts.preview(instructorId as number, from, to),
    enabled: canAccessFinance(role) && tokenCanAccessFinance() && instructorId != null && !!from && !!to,
  });
};
export const useMyPayoutPreview = (from: string, to: string) => {
  const scope = tokenScopeKey();
  return useQuery({
    queryKey: qk.payouts.previewMine(scope, from, to),
    queryFn: () => api.payouts.previewMine(from, to),
    enabled: tokenIsInstructor() && !!from && !!to,
  });
};
// [TBO-16 #9] 수업 요청 — 승인센터·배지(tasks)·캘린더가 **같은 queryKey를 구독**(단일 이벤트 객체).
//  서버가 역할별 스코프 적용(강사=본인 요청만) — 클라 필터 불요.
export const useScheduleRequests = () =>
  useQuery({ queryKey: scheduleRequestListKey(tokenScopeKey()), queryFn: ({ signal }) => api.scheduleRequests.list(undefined, { signal }) });
export const useCounselForms = () => useQuery({ queryKey: qk.counsel.forms(), queryFn: () => api.counsel.forms() });
export const useCounselRounds = () => useQuery({ queryKey: qk.counsel.rounds(), queryFn: () => api.counsel.rounds() });
export const useAcademyEvents = () => useQuery({ queryKey: qk.events.list(), queryFn: () => api.events.list() });
// [TBO-19 Sprint4] 강사 계약(매니저 전용 — 계약 대비 실제 시수). 백엔드 GET이 ADMIN 게이트라 비관리자는 비활성.
export const useInstructorContracts = () => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({ queryKey: ["instructor-contracts", "list"] as const, queryFn: () => api.instructorContracts.list(), enabled: isAdmin(role) && tokenIsAdmin(), staleTime: CATALOG_STALE });
};
// [강사 출결 상세] 특정 강사의 기간 세션 — **권위 소스 /schedule 서버 필터**(instructorId·from·to). 참조 무결성:
//  세션 데이터를 복제하지 않고 단일 소스에서 조회, qk.schedule 하위 키라 세션 변경 시 자동 무효화.
export const useInstructorSessions = (instructorId: number | null, from?: string, to?: string) => {
  const role = useTacoStore((s) => s.currentRole);
  const scope = tokenScopeKey();
  return useQuery({
    queryKey: qk.schedule.list({ instructorId: instructorId ?? undefined, from, to }, scope),
    queryFn: () => api.schedule.list({ instructorId: instructorId as number, from, to }),
    enabled: isAdmin(role) && instructorId != null && !!from && !!to,
  });
};
// [R-6·C2C-b] 엔티티 변경 이력(audit_log) — ADMIN(토큰 게이트 동반). 세션 상세·승인센터 상세 모달 공용.
//  entity = audit_log.entity 값('class_sessions'·'schedule_requests'·'availability_blocks' 등).
export const useEntityAudit = (entity: string, entityId: number | null) => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({
    queryKey: ["audit", entity, entityId ?? 0] as const,
    queryFn: () => api.audit.list(entity, entityId as number),
    enabled: isAdmin(role) && tokenIsAdmin() && entityId != null,
  });
};
// [R-6] 세션 변경 이력 — entity='class_sessions' 별칭(기존 소비처 유지, 단일 구현=useEntityAudit).
export const useSessionAudit = (sessionId: number | null) => useEntityAudit("class_sessions", sessionId);
// [TBO-19] 강사 출결 현황 집계(관리자 대시보드) — 기간·강사 필터. 서버 집계(DB 이관 시 GROUP BY 승격).
export const useInstructorAttendanceSummary = (from?: string, to?: string, instructorId?: number) => {
  const role = useTacoStore((s) => s.currentRole);
  return useQuery({
    queryKey: ["instructor-attendance-summary", from ?? null, to ?? null, instructorId ?? null] as const,
    queryFn: () => api.schedule.instructorAttendanceSummary(from, to, instructorId),
    enabled: isAdmin(role) && tokenIsAdmin() && !!from && !!to,
  });
};
export const useRoadmaps = () => useQuery({ queryKey: qk.roadmaps.list(), queryFn: () => api.roadmaps.list() });
export const useRoadmapCourses = () => useQuery({ queryKey: qk.roadmaps.courses(), queryFn: () => api.roadmaps.courses() });

// 보고서는 store 모델로 매핑해서 반환(배지·리포트 화면이 store 형상 사용).
export const useReports = () =>
  useQuery({ queryKey: qk.reports.list(undefined, tokenScopeKey()), queryFn: async () => (await api.reports.list()).map(toStoreReport) });

// 강사 목록 = 스케줄 자원(resources)에서 파생(단일 소스). store.instructors 대체.
export const useInstructors = () =>
  useQuery({
    queryKey: qk.schedule.resources(tokenScopeKey()),
    queryFn: ({ signal }) => api.schedule.resources({ signal }),
    select: (res): Instructor[] => res.instructors.map((i) => ({ id: i.id, name: i.name, subjectName: i.sub })),
    staleTime: CATALOG_STALE,
  });

// 교차 도메인 slice — buildTasks/navBadges/lib.reports가 store 대신 이걸 받는다(전환용 컴포지트).
// 각 배열은 로딩 전 빈 배열(뷰 안전). currentRole은 zustand(클라 상태)에서 별도로 읽는다.
export function useAppData() {
  const role = useTacoStore((s) => s.currentRole);
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
  return {
    students, parents, parentStudents, subjects, courses, enrollments, classSessions,
    attendance, sessionReports, payments, transactions, expenses, instructorPayouts,
    counselForms, counselRounds, academyEvents, roadmaps, roadmapCourses, instructors,
    scheduleRequests,
  };
}

// 네비게이션 배지/알림은 buildTasks가 실제 사용하는 도메인만 구독한다.
export function useTaskData() {
  const role = useTacoStore((s) => s.currentRole);
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
  };
}

// ── 뮤테이션 훅 (중앙화) ──
// 쓰기는 전부 백엔드 API 경유 + 성공 시 관련 queryKey invalidate → Query(및 store 하이드레이션) 자동 갱신.
// 각 뷰는 아래 훅만 호출(useMutation+invalidate 반복 제거 = 함수 통일).
function useInvalidator(keys: QueryKey[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: key })));
}

// 카탈로그
export const useCreateCourse = () => useMutation({ mutationFn: api.courses.create, onSuccess: useInvalidator([qk.courses.all]) });
export const useCreateSubject = () => useMutation({ mutationFn: api.subjects.create, onSuccess: useInvalidator([qk.subjects.all]) });
export const useCreateEvent = () => useMutation({ mutationFn: api.events.create, onSuccess: useInvalidator([qk.events.all]) });
export const useCreateRoadmap = () => useMutation({ mutationFn: api.roadmaps.create, onSuccess: useInvalidator([qk.roadmaps.all]) });

// 명단(학생·수강)
export const useCreateStudent = () => useMutation({ mutationFn: api.students.create, onSuccess: useInvalidator([qk.students.all]) });
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

// 스케줄(생성·수정·삭제) — 삭제/상태변경은 리포트·정산 적격에도 영향 → 폭넓게 무효화
export const useCreateSchedule = () => useMutation({ mutationFn: api.schedule.create, onSuccess: useInvalidator([qk.schedule.all]) });
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
    onSuccess: useInvalidator([qk.schedule.all, qk.reports.all, qk.payouts.all]),
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
export const useRemoveSchedule = () => useMutation({ mutationFn: api.schedule.remove, onSuccess: useInvalidator([qk.schedule.all, qk.reports.all, qk.payouts.all]) });

// 수업 요청(TBO-16 #9) — 승인 시 세션이 생기므로 schedule도 무효화(참조 무결성 — 캘린더·배지 동시 갱신)
export const useCreateScheduleRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.scheduleRequests.create,
    onSuccess: (data) => {
      upsertScheduleRequestCache(qc, tokenScopeKey(), data.row);
      return invalidateScheduleRequests(qc);
    },
  });
};
export const useApproveScheduleRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; force?: boolean }) => api.scheduleRequests.approve(v.id, v.force),
    // [C2C-b] audit 프리픽스 무효화 — 상세 모달 '처리 이력'이 승인 직후 즉시 갱신
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, tokenScopeKey(), data.request);
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
  return useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.scheduleRequests.reject(v.id, v.reason), // 사유 필수
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, tokenScopeKey(), data);
      await refreshScheduleRequestLifecycle(qc);
    },
  });
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 상세 모달 편집. 승인센터·배지·캘린더 고스트 동시 갱신
export const useUpdateScheduleRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof api.scheduleRequests.update>[1] }) => api.scheduleRequests.update(v.id, v.body),
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, tokenScopeKey(), data);
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
export const useAdjustPayout = () =>
  useMutation({ mutationFn: (v: { id: number; amount: number; reason?: string }) => api.payouts.adjust(v.id, v.amount, v.reason), onSuccess: useInvalidator([qk.payouts.all]) });
