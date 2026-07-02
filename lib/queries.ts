// [참조/처리] 서버 상태 단일 소스 = TanStack Query. 도메인별 읽기 훅을 여기 모아
//  뷰가 store(zustand) 대신 이 훅으로 서버 데이터를 구독한다(실서비스 패턴).
//  - 쓰기(useMutation)는 Q3에서 도메인별로 추가하며 성공 시 관련 queryKey를 invalidate한다.
//  - buildTasks/navBadges/lib.reports 등 "여러 도메인 slice"가 필요한 로직은 useAppData()로 조립해 넘긴다.
"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Instructor, SessionReport } from "@/types";

// 백엔드 보고서(draft|submitted|approved|rejected)를 store 모델로 정규화.
//  approved→'sent'(작성완료 집계) · rejected→'draft'(재작성=미작성 집계). 실제 상태는 approvalStatus에 보존.
export function toStoreReport(r: ApiReport): SessionReport {
  const status: SessionReport["status"] =
    r.status === "approved" ? "sent" : r.status === "rejected" ? "draft" : r.status;
  return {
    id: r.id, sessionId: r.sessionId, studentId: r.studentId, instructorId: r.instructorId,
    subjectId: r.subjectId, content: r.content, homework: r.homework,
    status, approvalStatus: r.status,
    submittedAt: r.submittedAt, approvedAt: r.approvedAt, approvedBy: r.approvedBy,
    rejectedReason: r.rejectedReason,
  };
}

// ── 도메인 읽기 훅 (뷰는 { data = [] } 형태로 구독) ──
export const useStudents = () => useQuery({ queryKey: qk.students.list(), queryFn: () => api.students.list() });
export const useParents = () => useQuery({ queryKey: qk.parents.list(), queryFn: () => api.parents.list() });
export const useParentStudents = () => useQuery({ queryKey: qk.parents.relations(), queryFn: () => api.parents.relations() });
export const useSubjects = () => useQuery({ queryKey: qk.subjects.list(), queryFn: () => api.subjects.list() });
export const useCourses = () => useQuery({ queryKey: qk.courses.list(), queryFn: () => api.courses.list() });
export const useEnrollments = () => useQuery({ queryKey: qk.enrollments.list(), queryFn: () => api.enrollments.list() });
export const useSchedule = () => useQuery({ queryKey: qk.schedule.list({}), queryFn: () => api.schedule.list({}) });
export const useAttendance = () => useQuery({ queryKey: qk.attendance.list(), queryFn: () => api.attendance.list() });
export const usePayments = () => useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list() });
export const useTransactions = () => useQuery({ queryKey: qk.transactions.list(), queryFn: () => api.transactions.list() });
export const useExpenses = () => useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list() });
export const usePayouts = () => useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list() });
export const useCounselForms = () => useQuery({ queryKey: qk.counsel.forms(), queryFn: () => api.counsel.forms() });
export const useCounselRounds = () => useQuery({ queryKey: qk.counsel.rounds(), queryFn: () => api.counsel.rounds() });
export const useAcademyEvents = () => useQuery({ queryKey: qk.events.list(), queryFn: () => api.events.list() });
export const useRoadmaps = () => useQuery({ queryKey: qk.roadmaps.list(), queryFn: () => api.roadmaps.list() });
export const useRoadmapCourses = () => useQuery({ queryKey: qk.roadmaps.courses(), queryFn: () => api.roadmaps.courses() });

// 보고서는 store 모델로 매핑해서 반환(배지·리포트 화면이 store 형상 사용).
export const useReports = () =>
  useQuery({ queryKey: qk.reports.list(), queryFn: async () => (await api.reports.list()).map(toStoreReport) });

// 강사 목록 = 스케줄 자원(resources)에서 파생(단일 소스). store.instructors 대체.
export const useInstructors = () =>
  useQuery({
    queryKey: [...qk.schedule.all, "resources", "instructors"] as const,
    queryFn: async (): Promise<Instructor[]> => {
      const res = await api.schedule.resources();
      return res.instructors.map((i) => ({ id: i.id, name: i.name, subjectName: i.sub }));
    },
  });

// 교차 도메인 slice — buildTasks/navBadges/lib.reports가 store 대신 이걸 받는다(전환용 컴포지트).
// 각 배열은 로딩 전 빈 배열(뷰 안전). currentRole은 zustand(클라 상태)에서 별도로 읽는다.
export function useAppData() {
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
  const instructorPayouts = usePayouts().data ?? [];
  const counselForms = useCounselForms().data ?? [];
  const counselRounds = useCounselRounds().data ?? [];
  const academyEvents = useAcademyEvents().data ?? [];
  const roadmaps = useRoadmaps().data ?? [];
  const roadmapCourses = useRoadmapCourses().data ?? [];
  const instructors = useInstructors().data ?? [];
  return {
    students, parents, parentStudents, subjects, courses, enrollments, classSessions,
    attendance, sessionReports, payments, transactions, expenses, instructorPayouts,
    counselForms, counselRounds, academyEvents, roadmaps, roadmapCourses, instructors,
  };
}
