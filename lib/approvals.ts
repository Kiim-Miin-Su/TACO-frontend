// [핫픽스 2026-07-20 대표 보고 ②] 승인센터 모집단 **단일 소스** — 대시보드 카드·Topbar 알림·
//  사이드바 배지·승인센터 화면이 전부 이 술어를 공유한다(같은 컴포넌트/함수 통일 지시).
//  결함의 실체: lib/tasks의 '/admin' 집계가 보고서·지출·정산·수업요청 4종만 세고 **가입 승인
//  대기·프로필 변경 요청은 제외**("가입 승인은 백엔드 계정" 주석) — 승인센터에는 보이는데
//  대시보드·배지에는 안 뜨는 불일치가 여기서 났다.
import type { Expense, InstructorPayout, SessionReport } from '@/types';
import type { PendingAccount, ProfileChangeRequest } from '@/lib/api';

// 보고서 승인 대기 — 제출됨(신·구 status 겸용) ∧ 미승인. (ApprovalsView·tasks 공용)
export const reportApprovalRows = <T extends Pick<SessionReport, 'status'> & { approvalStatus?: string }>(rows: T[]): T[] =>
  rows.filter((r) => (r.status === 'submitted' || r.approvalStatus === 'submitted') && r.approvalStatus !== 'approved');

// 지출 승인 대기.
export const expenseApprovalRows = <T extends Pick<Expense, 'status'>>(rows: T[]): T[] =>
  rows.filter((e) => e.status === 'requested');

// 강사 페이 승인 대기(pending — 확정 대기).
export const payoutApprovalRows = <T extends Pick<InstructorPayout, 'status'>>(rows: T[]): T[] =>
  rows.filter((p) => p.status === 'pending');

// 수업 요청 승인 대기.
export const scheduleRequestApprovalRows = <T extends { status: string }>(rows: T[]): T[] =>
  rows.filter((r) => r.status === 'pending');

// 프로필 변경 승인 대기.
export const profileChangeApprovalRows = <T extends Pick<ProfileChangeRequest, 'status'>>(rows: T[]): T[] =>
  rows.filter((r) => r.status === 'pending');

// 가입 승인 대기 — /auth/pending 응답 전원이 대상(모집단 그 자체).
export const signupApprovalRows = <T extends Pick<PendingAccount, 'status'>>(rows: T[]): T[] => rows;

export type ApprovalCenterSlice = {
  sessionReports: Array<Pick<SessionReport, 'status'> & { approvalStatus?: string }>;
  expenses: Array<Pick<Expense, 'status'>>;
  instructorPayouts: Array<Pick<InstructorPayout, 'status'>>;
  scheduleRequests: Array<{ status: string }>;
  pendingAccounts: Array<Pick<PendingAccount, 'status'>>;
  profileChangeRequests: Array<Pick<ProfileChangeRequest, 'status'>>;
};

/** 승인센터 대기 총합 — '/admin' 배지·대시보드 처리 대기와 승인센터 섹션 카운트의 공통 정의. */
export function approvalCenterCounts(s: ApprovalCenterSlice): {
  reports: number; expenses: number; payouts: number; scheduleRequests: number;
  signups: number; profileChanges: number; total: number;
} {
  const reports = reportApprovalRows(s.sessionReports).length;
  const expenses = expenseApprovalRows(s.expenses).length;
  const payouts = payoutApprovalRows(s.instructorPayouts).length;
  const scheduleRequests = scheduleRequestApprovalRows(s.scheduleRequests).length;
  const signups = signupApprovalRows(s.pendingAccounts).length;
  const profileChanges = profileChangeApprovalRows(s.profileChangeRequests).length;
  return {
    reports, expenses, payouts, scheduleRequests, signups, profileChanges,
    total: reports + expenses + payouts + scheduleRequests + signups + profileChanges,
  };
}
