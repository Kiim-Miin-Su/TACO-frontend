"use client";
// 컴포지트(useAppData/useTaskData)·뷰 프리셋·리포트 템플릿·알림 뱃지 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation } from "@tanstack/react-query";
import { addDaysISO, todayKst } from '@/lib/format'; // [P2]
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { canAccessFinance } from "@/lib/roles";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { CATALOG_STALE, useInvalidator } from "./shared";
import { useStudents, useParents, useParentStudents, useEnrollments, useCounselForms, useCounselRounds } from "./students";
import { useSubjects, useCourses } from "./academics";
import { useSchedule, useCalendarSchedule, useAttendance, useAcademyEvents, useInstructors, useScheduleRequests } from "./schedule";
import { usePayments, useTransactions, useExpenses, usePayouts, useReports } from "./finance";
import { usePendingAccounts, useProfileChangeRequests, useMyProfileChangeRequests } from "./admin";

// [TBO-62 ⑥ 2026-07-24] useMyPayoutPreview 제거 — 강사 시수 미리보기는 관리자 전용(서버 라우트 삭제).
const usePayReadiness = () => {
  const { scope, can } = useAccountAccess();
  // 금액 없는 시수 누락 판정은 운영 관리자에게 허용하되 금액 워크시트와 분리한다.
  return useQuery({
    queryKey: qk.payouts.readiness(scope),
    queryFn: () => api.payouts.readiness(),
    enabled: can("payout.readiness"),
    refetchOnWindowFocus: true, // [TBO-66 F3] 금전 화면 신선도
    staleTime: 15_000,
  });
};

// [B3 2026-07-16] 알림 뱃지 읽음 — 탭별 last-seen(서버 영속). 마킹 성공 시 맵 무효화.
export const useNavSeen = () =>
  useQuery({ queryKey: qk.navSeen.all, queryFn: () => api.navSeen.list(), staleTime: 15_000 });
export const useMarkNavSeen = () =>
  useMutation({ mutationFn: (navKey: string) => api.navSeen.mark(navKey), onSuccess: useInvalidator([qk.navSeen.all]) });

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
  const instructorPayouts = canAccessFinance(role) ? financePayouts : [];
  const counselForms = useCounselForms().data ?? [];
  const counselRounds = useCounselRounds().data ?? [];
  const academyEvents = useAcademyEvents().data ?? [];
  const instructors = useInstructors().data ?? [];
  const scheduleRequests = useScheduleRequests().data ?? []; // TBO-16 — 배지·승인센터 동일 모집단
  // [핫픽스 2026-07-20 ②] 가입 승인·프로필 변경도 배지/할일 모집단에 — 권한 게이트는 각 훅이 수행
  //  (비대상 역할은 disabled → 빈 배열). 반려 사유 알림용 내 요청(mine)도 함께 구독.
  const pendingAccounts = usePendingAccounts().data ?? [];
  const profileChangeRequests = useProfileChangeRequests().data ?? [];
  const myProfileChangeRequests = useMyProfileChangeRequests().data ?? [];
  const payReadiness = usePayReadiness().data;
  return {
    students, parents, parentStudents, subjects, courses, enrollments, classSessions,
    attendance, sessionReports, payments, transactions, expenses, instructorPayouts,
    counselForms, counselRounds, academyEvents, instructors,
    scheduleRequests, pendingAccounts, profileChangeRequests, myProfileChangeRequests, payReadiness,
  };
}

// 네비게이션 배지/알림은 buildTasks가 실제 사용하는 도메인만 구독한다.
export function useTaskData() {
  const { role } = useAccountAccess();
  const financePayouts = usePayouts().data ?? [];
  const payReadiness = usePayReadiness().data;
  // [TBO-34 C4 2026-07-23] 배지의 classSessions 소비는 sessionDate >= 오늘(다가오는 수업)뿐 —
  //  전체 이력 대신 미래분만 구독(useCalendarSchedule 재사용, schedule prefix 키라 무효화 자동 포함).
  //  실측: 전 페이지 첫 로드가 이 훅으로 전 도메인 14목록을 받고 schedule이 페이로드 1위(12.5KB).
  const upcomingFrom = todayKst(); // [P2] buildTasks와 동일 — KST 진실원
  const upcomingSessions = useCalendarSchedule({ from: upcomingFrom }).data ?? [];
  // 시간 변경으로 과거에 놓인 회차의 출결 요구 뱃지는 미래 목록만으로는 사라진다.
  // 최근 31일을 별도 조회해 서버 파생 attendanceRequired를 합치고 id로 중복 제거한다.
  const recentSessions = useCalendarSchedule({
    from: addDaysISO(upcomingFrom, -31),
    to: upcomingFrom,
  }).data ?? [];
  const taskSessions = [...new Map(
    [...recentSessions.filter((row) => row.attendanceRequired), ...upcomingSessions]
      .map((row) => [Number(row.id), row]),
  ).values()];
  return {
    instructors: useInstructors().data ?? [],
    students: useStudents().data ?? [],
    courses: useCourses().data ?? [],
    enrollments: useEnrollments().data ?? [],
    classSessions: taskSessions,
    sessionReports: useReports().data ?? [],
    expenses: useExpenses().data ?? [],
    instructorPayouts: canAccessFinance(role) ? financePayouts : [],
    counselForms: useCounselForms().data ?? [],
    payments: usePayments().data ?? [],
    scheduleRequests: useScheduleRequests().data ?? [],
    // [핫픽스 2026-07-20 ②] 배지·알림에 가입 승인/프로필 변경 포함(권한 게이트는 훅이 수행)
    pendingAccounts: usePendingAccounts().data ?? [],
    profileChangeRequests: useProfileChangeRequests().data ?? [],
    myProfileChangeRequests: useMyProfileChangeRequests().data ?? [],
    payReadiness,
  };
}

// ── 자산화 2차(2026-07-03): 뷰 프리셋·리포트 템플릿 — 클라 휘발 → DB 컬렉션 ──
export const useViewPresets = () => useQuery({ queryKey: qk.viewPresets.list(), queryFn: () => api.viewPresets.list(), staleTime: CATALOG_STALE });
export const useCreateViewPreset = () => useMutation({ mutationFn: api.viewPresets.create, onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useUpdateViewPreset = () => useMutation({ mutationFn: (v: { id: number; input: Parameters<typeof api.viewPresets.update>[1] }) => api.viewPresets.update(v.id, v.input), onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useRemoveViewPreset = () => useMutation({ mutationFn: api.viewPresets.remove, onSuccess: useInvalidator([qk.viewPresets.all]) });
export const useReportTemplates = () => useQuery({ queryKey: qk.reportTemplates.list(), queryFn: () => api.reportTemplates.list(), staleTime: CATALOG_STALE });
export const useCreateReportTemplate = () => useMutation({ mutationFn: api.reportTemplates.create, onSuccess: useInvalidator([qk.reportTemplates.all]) });
export const useUpdateReportTemplate = () =>
  useMutation({
    mutationFn: (value: { id: number; input: Parameters<typeof api.reportTemplates.update>[1] }) =>
      api.reportTemplates.update(value.id, value.input),
    onSuccess: useInvalidator([qk.reportTemplates.all]),
  });
// [TBO-58 P2] 템플릿 삭제 — BE DELETE 기구현, FE 훅·버튼만 부재였던 갭(검증①)
export const useRemoveReportTemplate = () => useMutation({ mutationFn: api.reportTemplates.remove, onSuccess: useInvalidator([qk.reportTemplates.all]) });
