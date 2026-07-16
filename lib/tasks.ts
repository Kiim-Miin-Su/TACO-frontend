// 역할별 "대기 중인 할 일(To-do)" 단일 소스.
// Topbar 알림 배지 카운트와 대시보드 To-do 섹션이 같은 로직을 공유한다.
import type {
  AccountRole,
  ClassSession,
  ScheduleRequest,
  CounselForm,
  Course,
  Enrollment,
  Expense,
  Instructor,
  InstructorPayout,
  Payment,
  SessionReport,
  Student,
} from '@/types';
import type { Tone } from '@/components/ui';
import { isAdmin } from '@/lib/roles';
import { pendingReportSessions, pendingReportSummary, sessionEndMs, type ReportSlice } from '@/lib/reports';
import { makeupNeeds, makeupNeededCount, MAKEUP_REASON_LABEL } from '@/lib/makeup';

// 회계상 분리: pay(강사 페이=출금) / expense(지출=출금) / payment(결제·수납=입금) / counsel(상담) / report·class(강사)
export type TaskGroup = 'pay' | 'expense' | 'payment' | 'counsel' | 'report' | 'class' | 'schedule';

export type TaskItem = {
  id: string;
  group: TaskGroup;
  title: string;
  detail?: string;
  href: string;
  tone: Tone;
  /** 빨간 배지(미룰 수 없는 할 일)에 포함할지 — 정보성 항목(다가오는 수업)은 false */
  counts: boolean;
};

// 대시보드/사이드바 데모에서 'instructor' 역할 = 박지훈(강사 id 1)로 매핑.
// 월 정산(재결제) 주기 기준 수업 횟수(데모). 주 2회 × 4주 = 8회.
export const PAYMENT_CYCLE_SESSIONS = 8;

type StoreSlice = ReportSlice & {
  currentRole: AccountRole;
  instructors: Instructor[];
  students: Student[];
  courses: Course[];
  classSessions: ClassSession[];
  sessionReports: SessionReport[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
  enrollments: Enrollment[];
  payments: Payment[];
  scheduleRequests: ScheduleRequest[]; // TBO-16 #9 — 승인센터·배지 동일 모집단(R1)
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const won = (n: number) => '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 관리자/매니저: 승인·지급·요청 대기 건 (회계상 그룹 분리)
function adminTasks(s: StoreSlice): TaskItem[] {
  const iname = (id: number) => s.instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`;
  const sname = (id?: number) => s.students.find((x) => x.id === id)?.name ?? '학생';
  const today = todayISO();
  const out: TaskItem[] = [];

  // ── 강사 페이(출금) — 승인 대기(pending) / 지급 대기(confirmed) ──
  for (const p of s.instructorPayouts) {
    if (p.status === 'pending') {
      out.push({
        id: `pay-approve-${p.id}`, group: 'pay', tone: 'attention', counts: true,
        title: `강사 페이 승인 대기 — ${iname(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)}${p.sessionCount ? ` (${p.sessionCount}회)` : ''}`,
        href: '/admin/approvals',
      });
    } else if (p.status === 'confirmed') {
      out.push({
        id: `pay-pay-${p.id}`, group: 'pay', tone: 'accent', counts: true,
        title: `강사 페이 지급 대기 — ${iname(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)} 지급 처리 필요`,
        href: '/payouts',
      });
    }
  }

  // ── 결제·수납(입금) — 미수 건만(청구 pending). 기한 경과면 연체. ──
  for (const pm of s.payments) {
    if (pm.status !== 'pending') continue;
    const overdue = !!pm.dueAt && pm.dueAt < today;
    out.push({
      id: `pay-due-${pm.id}`, group: 'payment', tone: overdue ? 'danger' : 'attention', counts: true,
      title: `미수금 — ${sname(pm.studentId)}`,
      detail: `${won(pm.amount)} · ${overdue ? '연체' : '납부 대기'}${pm.dueAt ? ` (기한 ${pm.dueAt})` : ''}`,
      href: '/payments',
    });
  }

  // ── 상담 — 미배정·날짜 미정 건만(상담실장이 정확한 날짜를 미정으로 둔 경우) ──
  for (const c of s.counselForms) {
    if (c.status !== 'requested') continue;
    const dateUndecided = !c.nextContactAt; // 정확한 상담 날짜 미정
    const unassigned = c.assignedStaffId == null; // 담당 미배정
    if (!dateUndecided && !unassigned) continue;
    out.push({
      id: `counsel-${c.id}`, group: 'counsel', tone: 'accent', counts: true,
      title: `상담 배정 대기 — ${c.applicantName}`,
      detail: `날짜 미정 · 담당/일정 배정 필요`,
      href: '/counsel',
    });
  }

  // ── 지출(출금) — 승인 대기 ──
  for (const e of s.expenses.filter((x) => x.status === 'requested')) {
    out.push({
      id: `expense-${e.id}`, group: 'expense', tone: 'attention', counts: true,
      title: `지출 승인 대기 — ${e.title}`,
      detail: `${won(e.amount)} · ${e.spentAt}`,
      href: '/admin/approvals',
    });
  }

  // ── 수업 요청(강사→매니저) 승인 대기 — TBO-16 #9. 승인센터와 같은 모집단(pending) ──
  for (const r of s.scheduleRequests.filter((x) => x.status === 'pending')) {
    // [0.1.18] availability 요청(requestKind) 분기 — 세션 필드가 없어 changeSummary로 표기.
    //  요청자 표기 폴백은 승인센터(ApprovalsView)와 동일 규칙(instructorId ?? owner ?? requesterId).
    const isAvail = r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete';
    const isUpdate = r.requestKind === 'session_update';
    const requestLabel = isAvail ? '가용시간 변경 승인 대기' : isUpdate ? '수업 변경 승인 대기' : '수업 요청 승인 대기';
    out.push({
      id: `schedule-request-${r.id}`, group: 'schedule', tone: 'attention', counts: true,
      title: `${requestLabel} — ${iname(r.instructorId ?? r.availabilityOwnerId ?? r.requesterId)}`,
      detail: isAvail ? (r.changeSummary ?? '가용/불가 변경 요청') : isUpdate ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime} · 수업 변경`) : `${r.sessionDate} ${r.startTime} · ${r.topic ?? '수업'}`,
      href: '/admin/approvals',
    });
  }

  // ── 수업 보고서 승인 대기(작성완료·미승인) — 승인은 관리자(승인센터) 책임이므로 /admin/approvals로 ──
  for (const r of s.sessionReports.filter((x) => (x.status === 'submitted' || x.approvalStatus === 'submitted') && x.approvalStatus !== 'approved')) {
    out.push({
      id: `report-approve-${r.id}`, group: 'report', tone: 'accent', counts: true,
      title: `수업 보고서 승인 대기 — ${sname(r.studentId)}`,
      detail: `${iname(r.instructorId)} · 승인 시 시수 집계`,
      href: '/admin/approvals',
    });
  }

  // ── [대표 지시 ⑭ 2026-07-16] 보강 미배정 — 결강(취소·노쇼·펑크)인데 보강 날짜가 아직 안 잡힌 수업.
  //  강사 탭과 **같은 단일 정의(lib/makeup)** 재사용 — 매니저도 배정을 챙겨야 하므로 관리자 To-do에 편입.
  for (const m of makeupNeeds(s).filter((x) => !x.resolved)) {
    out.push({
      id: `makeup-${m.session.id}`, group: 'class', tone: 'danger', counts: true,
      title: `보강 미배정 — ${iname(m.session.instructorId)}`,
      detail: `${m.session.sessionDate} ${m.session.startTime ?? ''} · ${MAKEUP_REASON_LABEL[m.reason]} · 보강 일정 필요`,
      href: '/calendar',
    });
  }
  return out;
}

// 강사: 리포트 미작성(진행된 내 수업) + 오늘/다가오는 내 수업
function instructorTasks(s: StoreSlice, instructorId: number): TaskItem[] {
  const today = todayISO();
  const out: TaskItem[] = [];

  // 진행됐는데 리포트 미작성 → 시수/페이가 잡히려면 작성 필요. (단일 소스: lib/reports)
  for (const ses of pendingReportSessions(s, instructorId)) {
    out.push({
      id: `report-${ses.id}`, group: 'report', tone: 'danger', counts: true,
      title: `리포트 미작성 — ${ses.topic ?? '수업'}`,
      detail: `${ses.sessionDate} ${ses.startTime ?? ''} · 작성해야 시수가 측정됩니다`,
      href: '/reports/write',
    });
  }

  // 취소·미진행(펑크) → 보강 필요(월 시수 부족). 캘린더에서 보강 일정을 잡아야 함. (단일 소스: lib/makeup)
  for (const m of makeupNeeds(s, instructorId).filter((x) => !x.resolved)) {
    const ses = m.session;
    out.push({
      id: `makeup-${ses.id}`, group: 'class', tone: 'attention', counts: true,
      title: `보강 필요 — ${ses.topic ?? '수업'}`,
      detail: `${ses.sessionDate} ${ses.startTime ?? ''} · ${MAKEUP_REASON_LABEL[m.reason]} → 보강 일정 필요`,
      href: '/calendar',
    });
  }

  // 내 수업 요청 결과 — 반려=조치 필요(카운트), 대기=정보성. 서버가 본인 것만 반환(수평 권한).
  for (const r of s.scheduleRequests) {
    const isAvail = r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete';
    const isUpdate = r.requestKind === 'session_update';
    const what = isAvail ? (r.changeSummary ?? '가용/불가 변경') : isUpdate ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime}`) : `${r.sessionDate} ${r.startTime}`;
    if (r.status === 'rejected') {
      out.push({
        id: `my-request-${r.id}`, group: 'schedule', tone: 'danger', counts: true,
        title: `${isAvail ? '가용시간 변경 반려' : isUpdate ? '수업 변경 반려' : '수업 요청 반려'} — ${isAvail || isUpdate ? '' : r.topic ?? '수업'}`.replace(/ — $/, ''),
        detail: `${what} · 사유: ${r.reason ?? '-'}`,
        href: '/calendar',
      });
    } else if (r.status === 'pending') {
      out.push({
        id: `my-request-${r.id}`, group: 'schedule', tone: 'neutral', counts: false,
        title: `${isAvail ? '가용시간 변경 승인 대기 중' : isUpdate ? '수업 변경 승인 대기 중' : `수업 요청 승인 대기 중 — ${r.topic ?? '수업'}`}`,
        detail: what,
        href: '/calendar',
      });
    }
  }

  // 오늘 수업(진행 예정) — 카운트 / 다가오는 수업 — 정보성
  const upcoming = s.classSessions
    .filter((ses) => ses.instructorId === instructorId && ses.status === 'scheduled' && ses.sessionDate >= today)
    .sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? '')));
  for (const ses of upcoming) {
    const isToday = ses.sessionDate === today;
    out.push({
      id: `class-${ses.id}`, group: 'class', tone: isToday ? 'success' : 'neutral', counts: isToday,
      title: `${isToday ? '오늘 수업' : '다가오는 수업'} — ${ses.topic ?? '수업'}`,
      detail: `${ses.sessionDate} ${ses.startTime ?? ''}`,
      href: '/schedule',
    });
  }
  return out;
}

export function buildTasks(s: StoreSlice, role: AccountRole = s.currentRole, instructorId?: number): { items: TaskItem[]; count: number } {
  let items: TaskItem[] = [];
  if (isAdmin(role)) items = adminTasks(s);
  else if (role === 'instructor' && instructorId != null) items = instructorTasks(s, instructorId);
  // 학생/학부모는 운영 할 일 없음(일정은 캘린더에서)
  const count = items.filter((t) => t.counts).length;
  return { items, count };
}

// 사이드바 탭별 빨간 배지 개수 — 탭마다 명시적 기준(권한 반영). 0인 탭은 키 없음.
// 기준(요구사항): 상담=다음 만남 날짜 미정 / 결제=미수 / 강사페이=미정산 / 지출=승인대기 /
//   수업보고서=미작성(작성해야 할 세션당 1) / 관리자=미승인(승인 대기) 모두.
// [B3 2026-07-16 대표 결정 ①] seen(탭별 마지막 열람 시각) — 열람 이후 새 활동이 없으면 뱃지를 숨긴다.
//  각 항목의 활동 시각(updatedAt ?? createdAt, 보고서 대기는 세션 종료 시각)과 대조 — 탭 진입 시
//  FE가 서버에 last-seen을 upsert(useMarkNavSeen)하므로 기기 간에도 동일하게 사라진다.
const latestActivityMs = (rows: ReadonlyArray<unknown>): number =>
  rows.reduce<number>((max, r) => {
    const row = r as { updatedAt?: string; createdAt?: string };
    return Math.max(max, Date.parse(row.updatedAt ?? row.createdAt ?? '') || 0);
  }, 0);

export function navBadges(
  s: StoreSlice,
  role: AccountRole = s.currentRole,
  instructorId?: number,
  seen?: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (nav: string, n: number, latestMs = Number.POSITIVE_INFINITY) => {
    if (n <= 0) return;
    // 열람 게이트 — nav 키는 슬래시 제거('/admin'→'admin'). 열람 시각 ≥ 마지막 활동이면 숨김.
    const seenAt = seen?.[nav.replace(/^\//, '')];
    if (seenAt && Date.parse(seenAt) >= latestMs) return;
    out[nav] = n;
  };

  // 강사: 본인 수업보고서 미작성(보고서 건수) + 취소·미진행 보강 필요(캘린더 탭)
  // ⚠ 배지와 /reports 탭 리스트는 pendingReportSummary(같은 모집단)를 공유해야 한다(불일치 재발 방지).
  if (role === 'instructor') {
    if (instructorId == null) return out;
    put('/reports', pendingReportSummary(s, instructorId).itemCount,
      latestActivityMs(pendingReportSessions(s, instructorId).map((ses) => ({ updatedAt: new Date(sessionEndMs(ses)).toISOString() }))));
    // 보강 필요 + 반려된 내 수업 요청(재요청 필요) — 캘린더 탭
    const myMakeup = makeupNeeds(s, instructorId).filter((m) => !m.resolved);
    const myRejected = s.scheduleRequests.filter((r) => r.status === 'rejected');
    put('/calendar', myMakeup.length + myRejected.length,
      Math.max(latestActivityMs(myMakeup.map((m) => m.session)), latestActivityMs(myRejected)));
    return out;
  }
  if (!isAdmin(role)) return out; // 학생/학부모 등은 알림 없음

  // 관리자/매니저
  // [대표 지시 ⑭] 보강 미배정(결강인데 보강 날짜 미정) — 강사 배지와 같은 단일 정의(lib/makeup) 전체 집계.
  const adminMakeup = makeupNeeds(s).filter((m) => !m.resolved);
  put('/calendar', adminMakeup.length, latestActivityMs(adminMakeup.map((m) => m.session)));
  const counselRows = s.counselForms.filter((c) => c.status !== 'dropped' && !c.nextContactAt);
  put('/counsel', counselRows.length, latestActivityMs(counselRows)); // 다음 만남 날짜 미정(이탈 제외)
  const paymentRows = s.payments.filter((p) => p.status === 'pending');
  put('/payments', paymentRows.length, latestActivityMs(paymentRows)); // 미수(미납)
  const payoutRows = s.instructorPayouts.filter((p) => p.status === 'pending' || p.status === 'confirmed');
  put('/payouts', payoutRows.length, latestActivityMs(payoutRows)); // 미정산(미지급)
  const expenseRows = s.expenses.filter((e) => e.status === 'requested');
  put('/expenses', expenseRows.length, latestActivityMs(expenseRows)); // 승인 대기
  put('/reports', pendingReportSummary(s).itemCount,
    latestActivityMs(pendingReportSessions(s).map((ses) => ({ updatedAt: new Date(sessionEndMs(ses)).toISOString() })))); // 미작성 보고서 건수(전체) — 탭 리스트와 동일 모집단

  // 관리자(승인 센터): 미승인 모두 = 보고서 승인대기 + 지출 승인대기 + 강사페이 승인대기 (가입 승인은 백엔드 계정)
  const reportApproveRows = s.sessionReports.filter((r) => (r.status === 'submitted' || r.approvalStatus === 'submitted') && r.approvalStatus !== 'approved');
  const expenseApproveRows = expenseRows;
  const payoutApproveRows = s.instructorPayouts.filter((p) => p.status === 'pending');
  const requestApproveRows = s.scheduleRequests.filter((r) => r.status === 'pending'); // TBO-16 #9
  put('/admin', reportApproveRows.length + expenseApproveRows.length + payoutApproveRows.length + requestApproveRows.length,
    Math.max(latestActivityMs(reportApproveRows), latestActivityMs(expenseApproveRows), latestActivityMs(payoutApproveRows), latestActivityMs(requestApproveRows)));

  return out;
}
