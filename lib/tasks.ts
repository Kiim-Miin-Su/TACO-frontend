// 역할별 "대기 중인 할 일(To-do)" 단일 소스.
// Topbar 알림 배지 카운트와 대시보드 To-do 섹션이 같은 로직을 공유한다.
import type {
  AccountRole,
  ClassSession,
  ScheduleRow,
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
  PayReadiness,
  PayReadinessIssue,
  ReportWorklist,
  ReportWorklistItem,
} from '@/types';
import type { Tone } from '@/components/ui';
import { won, todayKst } from '@/lib/format'; // [감사 10] 사본 제거 — 단일 진실원
import { isAdmin, isInstructorSelf } from '@/lib/roles';
import type { ReportSlice } from '@/lib/reports';
import { makeupNeeds, MAKEUP_REASON_LABEL } from '@/lib/makeup';
// [핫픽스 2026-07-20 ②] 승인센터 모집단 단일 소스 — 대시보드·배지·승인센터가 같은 술어를 공유.
import { profileChangeApprovalRows, reportApprovalRows } from '@/lib/approvals';
import type { PendingAccount, ProfileChangeRequest } from '@/lib/api';
import { internalRoute, type InternalHref } from '@/lib/navigation-security';

// 회계상 분리: pay(강사 페이=출금) / expense(지출=출금) / payment(결제·수납=입금) / counsel(상담) / report·class(강사)
type TaskGroup = 'pay' | 'expense' | 'payment' | 'counsel' | 'report' | 'class' | 'schedule' | 'attendance' | 'account';

export type TaskItem = {
  id: string;
  group: TaskGroup;
  title: string;
  detail?: string;
  href: InternalHref;
  tone: Tone;
  /** 빨간 배지(미룰 수 없는 할 일)에 포함할지 — 정보성 항목(다가오는 수업)은 false */
  counts: boolean;
};

type StoreSlice = Omit<ReportSlice, 'classSessions'> & {
  currentRole: AccountRole;
  instructors: Instructor[];
  students: Student[];
  courses: Course[];
  classSessions: Array<ClassSession & Partial<Pick<ScheduleRow, 'attendanceRequired' | 'missingAttendance'>>>;
  sessionReports: SessionReport[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
  enrollments: Enrollment[];
  payments: Payment[];
  scheduleRequests: ScheduleRequest[]; // TBO-16 #9 — 승인센터·배지 동일 모집단(R1)
  // [핫픽스 2026-07-20 ②] 가입 승인·프로필 변경도 배지/할일 모집단에(승인센터와 동일) + 반려 사유
  //  알림용 내 요청(mine). 훅이 권한 게이트를 수행하므로 비대상 역할은 빈 배열이 들어온다.
  pendingAccounts: PendingAccount[];
  profileChangeRequests: ProfileChangeRequest[];
  myProfileChangeRequests: ProfileChangeRequest[];
  payReadiness?: PayReadiness;
  reportWorklist?: ReportWorklist;
};

const REPORT_READINESS_TYPES = new Set<PayReadinessIssue['type']>([
  'report_missing', 'report_draft', 'report_pending_approval', 'report_rejected',
]);

function readinessTask(s: StoreSlice, row: PayReadinessIssue | ReportWorklistItem, forInstructor: boolean): TaskItem {
  const student = row.studentId == null ? null : s.students.find((item) => item.id === row.studentId);
  const instructor = s.instructors.find((item) => item.id === row.instructorId);
  const context = `${row.sessionDate} ${row.startTime ?? ''} · ${student?.name ?? row.topic ?? `수업 ${row.sessionId}`}`;
  const base = { id: `pay-readiness-${row.id}`, counts: true } as const;
  switch (row.type) {
    case 'report_missing':
      return { ...base, group: 'report', tone: 'danger', title: `리포트 미작성 — ${student?.name ?? '학생'}`, detail: `${context} · 작성 및 승인 후 시수 반영`, href: '/reports/write' };
    case 'report_draft':
      return { ...base, group: 'report', tone: 'attention', title: `리포트 임시저장 — ${student?.name ?? '학생'}`, detail: `${context} · 제출 필요`, href: '/reports/write' };
    case 'report_pending_approval':
      return { ...base, group: 'report', tone: 'accent', title: `리포트 승인 대기 — ${student?.name ?? '학생'}`, detail: `${context} · 승인 후 시수 반영`, href: forInstructor ? '/reports/write' : '/admin/approvals' };
    case 'report_rejected':
      return { ...base, group: 'report', tone: 'danger', title: `리포트 반려 — ${student?.name ?? '학생'}`, detail: `${context} · 사유: ${row.rejectedReason ?? '사유 미기재'} · 수정 후 재제출`, href: '/reports/write' };
    case 'rate_missing':
      return { ...base, group: 'pay', tone: 'danger', title: `강사 페이 단가 미설정 — ${instructor?.name ?? `강사 ${row.instructorId}`}`, detail: context, href: forInstructor ? '/payouts' : internalRoute.adminInstructor(row.instructorId) };
    case 'session_roster_missing':
      return { ...base, group: 'class', tone: 'danger', title: `수업 대상 학생 미지정 — ${row.topic ?? '수업'}`, detail: context, href: '/calendar' };
    default:
      return { ...base, group: 'class', tone: 'danger', title: `수업 진행 상태 확인 — ${row.topic ?? '수업'}`, detail: `${context} · 진행 완료 상태가 필요합니다`, href: '/calendar' };
  }
}

// [핫픽스 2026-07-20 ③] 프로필 변경 요청의 변경 내용 한 줄 요약(알림 detail용).
const profileChangeSummary = (r: ProfileChangeRequest): string =>
  Object.keys(r.requestedChanges ?? {}).join(', ') || '프로필';

// [핫픽스 2026-07-20 ③] 내 프로필 변경 반려 알림 — 전 역할 공용(마이페이지 리스트에서 사유 확인).
function myProfileChangeRejectedTasks(rows: ProfileChangeRequest[]): TaskItem[] {
  return rows.filter((r) => r.status === 'rejected').map((r) => ({
    id: `my-profile-change-rejected-${r.id}`, group: 'account' as const, tone: 'danger' as const, counts: true,
    title: `프로필 변경 반려 — ${profileChangeSummary(r)}`,
    detail: `사유: ${r.rejectionReason ?? '사유 미기재'} · 마이페이지에서 확인`,
    href: '/account',
  }));
}

const todayISO = (): string => todayKst(); // [P2] KST 진실원(lib/format)

// 관리자/매니저: 승인·지급·요청 대기 건 (회계상 그룹 분리)
function adminTasks(s: StoreSlice): TaskItem[] {
  const iname = (id: number) => s.instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`;
  const sname = (id?: number) => s.students.find((x) => x.id === id)?.name ?? '학생';
  const today = todayISO();
  const out: TaskItem[] = [];
  for (const session of s.classSessions.filter((row) => row.attendanceRequired)) {
    out.push({
      id: `attendance-required-${session.id}`,
      group: 'attendance',
      tone: 'danger',
      counts: true,
      title: `출결 입력 필요 — ${session.topic ?? `수업 ${session.id}`}`,
      detail: `${session.sessionDate} ${session.startTime ?? ''} · 강사${session.missingAttendance?.instructor ? ' 미입력' : ' 입력'} · 학생 ${session.missingAttendance?.studentIds.length ?? 0}명 미입력`,
      href: '/attendance',
    });
  }

  // ── [핫픽스 2026-07-20 ②] 가입·계정 승인 — 승인센터에는 있는데 대시보드에 안 뜨던 결함 해소 ──
  for (const a of s.pendingAccounts) {
    out.push({
      id: `signup-approve-${a.id}`, group: 'account', tone: 'attention', counts: true,
      title: `가입 승인 대기 — ${a.name} (${a.webId})`,
      detail: `${a.email}${a.emailVerified ? '' : ' · 이메일 미인증(재발송 가능)'}`,
      href: '/admin/approvals',
    });
  }
  for (const r of profileChangeApprovalRows(s.profileChangeRequests)) {
    out.push({
      id: `profile-change-approve-${r.id}`, group: 'account', tone: 'attention', counts: true,
      title: `프로필 변경 승인 대기 — ${profileChangeSummary(r)}`,
      detail: r.reason || '사유 미기재',
      href: '/admin/approvals',
    });
  }
  // 승인센터가 직접 렌더링하는 제출 보고서도 같은 업무 원장에 포함한다. reportWorklist는
  // 작성/수정 필요 상태만 담으므로 승인 대기 보고서와 모집단이 겹치지 않는다.
  for (const report of reportApprovalRows(s.sessionReports)) {
    const session = s.classSessions.find((row) => row.id === report.sessionId);
    out.push({
      id: `report-approve-${report.id}`,
      group: 'report',
      tone: 'attention',
      counts: true,
      title: `수업 보고서 승인 대기 — ${sname(report.studentId)}`,
      detail: session
        ? `${session.sessionDate} ${session.startTime ?? ''} · ${iname(report.instructorId)}`
        : `${iname(report.instructorId)} · 보고서 #${report.id}`,
      href: '/admin/approvals',
    });
  }
  // [핫픽스 2026-07-20 ③] 반려 사유 알림 — 지출 반려(요청 주체가 관리자군)·내 프로필 변경 반려.
  for (const e of s.expenses.filter((x) => x.status === 'rejected')) {
    out.push({
      id: `expense-rejected-${e.id}`, group: 'expense', tone: 'danger', counts: true,
      title: `지출 반려 — ${e.title}`,
      detail: `${won(e.amount)} · 사유: ${(e as { rejectedReason?: string }).rejectedReason ?? '사유 미기재'}`,
      href: '/expenses',
    });
  }
  out.push(...myProfileChangeRejectedTasks(s.myProfileChangeRequests));

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
    const student = s.students.find((row) => row.id === c.studentId);
    out.push({
      id: `counsel-${c.id}`, group: 'counsel', tone: 'accent', counts: true,
      title: `상담 배정 대기 — ${student?.name ?? `학생 #${c.studentId}`}`,
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
    const isAttendanceCorrection = r.requestKind === 'instructor_attendance_correction';
    const requestLabel = isAvail ? '가용시간 변경 승인 대기'
      : isAttendanceCorrection ? '출결 정정 승인 대기'
        : isUpdate ? '수업 변경 승인 대기' : '수업 요청 승인 대기';
    out.push({
      id: `schedule-request-${r.id}`, group: 'schedule', tone: 'attention', counts: true,
      title: `${requestLabel} — ${iname(r.instructorId ?? r.availabilityOwnerId ?? r.requesterId)}`,
      detail: isAvail ? (r.changeSummary ?? '가용/불가 변경 요청')
        : isAttendanceCorrection ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime} · 출결 정정`)
          : isUpdate ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime} · 수업 변경`)
            : `${r.sessionDate} ${r.startTime} · ${r.topic ?? '수업'}`,
      href: '/admin/approvals',
    });
  }

  // 정산 준비 상태는 백엔드가 코호트 학생별로 판정한다. 프론트에서 보고서 완전성을 재계산하지 않는다.
  out.push(...(s.payReadiness?.issues ?? [])
    .filter((row) => !REPORT_READINESS_TYPES.has(row.type))
    .map((row) => readinessTask(s, row, false)));
  out.push(...(s.reportWorklist?.items ?? []).map((row) => readinessTask(s, row, false)));

  // ── [대표 지시 ⑭ 2026-07-16] 보강 미배정 — 결강(취소·노쇼·펑크)인데 보강 날짜가 아직 안 잡힌 수업.
  //  강사 탭과 **같은 단일 정의(lib/makeup)** 재사용 — 매니저도 배정을 챙겨야 하므로 관리자 To-do에 편입.
  for (const m of makeupNeeds(s).filter((x) => !x.resolved)) {
    out.push({
      id: `makeup-${m.session.id}`, group: 'class', tone: 'danger', counts: true,
      title: `보강 미배정 — ${m.session.instructorId == null ? '배정중' : iname(m.session.instructorId)}`,
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
  for (const session of s.classSessions.filter(
    (row) => row.attendanceRequired && Number(row.instructorId) === instructorId,
  )) {
    out.push({
      id: `attendance-required-${session.id}`,
      group: 'attendance',
      tone: 'danger',
      counts: true,
      title: `출결 입력 필요 — ${session.topic ?? `수업 ${session.id}`}`,
      detail: `${session.sessionDate} ${session.startTime ?? ''} · 강사${session.missingAttendance?.instructor ? ' 미입력' : ' 입력'} · 학생 ${session.missingAttendance?.studentIds.length ?? 0}명 미입력`,
      href: '/attendance',
    });
  }

  out.push(...(s.payReadiness?.issues ?? [])
    .filter((row) => row.instructorId === instructorId && !REPORT_READINESS_TYPES.has(row.type))
    .map((row) => readinessTask(s, row, true)));
  out.push(...(s.reportWorklist?.items ?? [])
    .filter((row) => row.instructorId === instructorId)
    .map((row) => readinessTask(s, row, true)));

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


  // [핫픽스 2026-07-20 ③] 내 정산 반려/지급 회수 — 사유와 함께 알림(강사 페이 화면에서 확인).
  for (const p of s.instructorPayouts.filter((x) => x.status === 'rejected')) {
    const reversed = !!(p as { reversedAt?: string }).reversedAt;
    out.push({
      id: `payout-rejected-${p.id}`, group: 'pay', tone: 'danger', counts: true,
      title: `${reversed ? '정산 지급 회수' : '정산 반려'} — ${p.periodStart}~${p.periodEnd}`,
      detail: `${won(p.amount)} · 사유: ${(p as { rejectedReason?: string }).rejectedReason ?? '사유 미기재'}`,
      href: '/payouts',
    });
  }

  // [핫픽스 2026-07-20 ③] 내 프로필 변경 반려 — 전 역할 공용 헬퍼.
  out.push(...myProfileChangeRejectedTasks(s.myProfileChangeRequests));

  // 내 수업 요청 결과 — 반려=조치 필요(카운트), 대기=정보성. 서버가 본인 것만 반환(수평 권한).
  for (const r of s.scheduleRequests) {
    const isAvail = r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete';
    const isUpdate = r.requestKind === 'session_update';
    const isAttendanceCorrection = r.requestKind === 'instructor_attendance_correction';
    const what = isAvail ? (r.changeSummary ?? '가용/불가 변경')
      : isAttendanceCorrection ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime} · 출결 정정`)
        : isUpdate ? (r.changeSummary ?? `${r.sessionDate} ${r.startTime}`) : `${r.sessionDate} ${r.startTime}`;
    if (r.status === 'rejected') {
      out.push({
        id: `my-request-${r.id}`, group: 'schedule', tone: 'danger', counts: true,
        title: `${isAvail ? '가용시간 변경 반려' : isAttendanceCorrection ? '출결 정정 반려' : isUpdate ? '수업 변경 반려' : '수업 요청 반려'} — ${isAvail || isUpdate || isAttendanceCorrection ? '' : r.topic ?? '수업'}`.replace(/ — $/, ''),
        // [핫픽스 07-20 ③] 반려 사유(rejectedReason)를 표기 — 종전엔 요청 사유(r.reason)를 보여줬다.
        detail: `${what} · 사유: ${(r as { rejectedReason?: string }).rejectedReason ?? r.reason ?? '-'}`,
        href: isAttendanceCorrection ? '/attendance' : '/calendar',
      });
    } else if (r.status === 'pending') {
      out.push({
        id: `my-request-${r.id}`, group: 'schedule', tone: 'neutral', counts: false,
        title: `${isAvail ? '가용시간 변경 승인 대기 중' : isAttendanceCorrection ? '출결 정정 승인 대기 중' : isUpdate ? '수업 변경 승인 대기 중' : `수업 요청 승인 대기 중 — ${r.topic ?? '수업'}`}`,
        detail: what,
        href: isAttendanceCorrection ? '/attendance' : '/calendar',
      });
    } else if (r.status === 'approved' && isAttendanceCorrection) {
      out.push({
        id: `my-request-${r.id}`, group: 'attendance', tone: 'success', counts: false,
        title: '출결 정정 승인됨',
        detail: what,
        href: '/attendance',
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

export type TaskBadgeProjection = {
  /** 배지에 포함되는 미해결 업무 총계. Topbar 알림 숫자의 권위다. */
  total: number;
  /** 실제 도착 화면별 개수. 관리자 내부 탭/버튼이 사용한다. */
  byDestination: Record<string, number>;
  /** 최상위 네비게이션별 개수. 모든 값의 합은 total과 같다. */
  byNavigation: Record<string, number>;
};

function taskDestination(href: InternalHref): string {
  if (href === '/schedule' || href.startsWith('/calendar')) return '/calendar';
  if (href.startsWith('/reports')) return '/reports';
  if (href.startsWith('/admin/approvals')) return '/admin/approvals';
  if (href.startsWith('/admin/instructors')) return '/admin/instructors';
  if (href.startsWith('/admin/users')) return '/admin/users';
  if (href.startsWith('/admin/courses')) return '/admin/courses';
  if (href.startsWith('/admin/roadmaps')) return '/admin/roadmaps';
  if (href.startsWith('/admin/events')) return '/admin/events';
  if (href.startsWith('/admin')) return '/admin';
  const firstSegment = href.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '/';
}

function taskNavigation(destination: string): string {
  // 강사 원부는 최상위 독립 탭이고, 나머지 관리자 하위 화면은 관리자 탭으로 모은다.
  if (destination === '/admin/instructors') return destination;
  if (destination.startsWith('/admin')) return '/admin';
  return destination;
}

export function projectTaskBadges(items: readonly TaskItem[]): TaskBadgeProjection {
  const byDestination: Record<string, number> = {};
  const byNavigation: Record<string, number> = {};
  let total = 0;
  for (const item of items) {
    if (!item.counts) continue;
    total += 1;
    const destination = taskDestination(item.href);
    const navigation = taskNavigation(destination);
    byDestination[destination] = (byDestination[destination] ?? 0) + 1;
    byNavigation[navigation] = (byNavigation[navigation] ?? 0) + 1;
  }
  return { total, byDestination, byNavigation };
}

export function sumTaskBadges(badges: Readonly<Record<string, number>>, destinations?: readonly string[]): number {
  const keys = destinations ?? Object.keys(badges);
  return keys.reduce((sum, key) => sum + (badges[key] ?? 0), 0);
}

export function buildTasks(
  s: StoreSlice,
  role: AccountRole = s.currentRole,
  instructorId?: number,
): { items: TaskItem[]; count: number; badges: TaskBadgeProjection } {
  let items: TaskItem[] = [];
  // [TBO-79 G5] actor 권한 판정은 capability로 — role 리터럴 비교는 CAPABILITY_ROLES가 바뀌어도
  //  따라오지 않는다(같은 함수 한 줄 위 isAdmin은 이미 capability 기반이었다).
  if (isAdmin(role)) items = adminTasks(s);
  else if (isInstructorSelf(role) && instructorId != null) items = instructorTasks(s, instructorId);
  // 학생/학부모는 운영 할 일 없음(일정은 캘린더에서)
  const badges = projectTaskBadges(items);
  return { items, count: badges.total, badges };
}

// 호환 API. 뱃지는 buildTasks의 미해결 업무에서만 투영한다. 열람 시각은 업무 해결 상태가 아니므로
// 더 이상 카운트를 숨기지 않는다. 승인/반려/입력 완료 뒤 서버 모집단에서 빠질 때만 내려간다.
export function navBadges(
  s: StoreSlice,
  role: AccountRole = s.currentRole,
  instructorId?: number,
  _seen?: Record<string, string>,
): Record<string, number> {
  return buildTasks(s, role, instructorId).badges.byNavigation;
}
