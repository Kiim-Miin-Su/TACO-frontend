// 역할별 "대기 중인 할 일(To-do)" 단일 소스.
// Topbar 알림 배지 카운트와 대시보드 To-do 섹션이 같은 로직을 공유한다.
import type {
  AccountRole,
  ClassSession,
  CounselForm,
  Expense,
  Instructor,
  InstructorPayout,
  SessionReport,
} from '@/types';
import type { Tone } from '@/components/ui';
import { isAdmin } from '@/lib/roles';

export type TaskGroup = 'pay' | 'report' | 'class' | 'expense' | 'counsel';

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
export const DEMO_INSTRUCTOR_ID = 1;

type StoreSlice = {
  currentRole: AccountRole;
  instructors: Instructor[];
  classSessions: ClassSession[];
  sessionReports: SessionReport[];
  expenses: Expense[];
  instructorPayouts: InstructorPayout[];
  counselForms: CounselForm[];
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const won = (n: number) => '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 관리자/매니저: 승인·지급·요청 대기 건
function adminTasks(s: StoreSlice): TaskItem[] {
  const name = (id: number) => s.instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`;
  const out: TaskItem[] = [];

  // 강사 페이 — 승인 대기(pending) / 지급 대기(confirmed)
  for (const p of s.instructorPayouts) {
    if (p.status === 'pending') {
      out.push({
        id: `pay-approve-${p.id}`, group: 'pay', tone: 'attention', counts: true,
        title: `강사 페이 승인 대기 — ${name(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)}${p.sessionCount ? ` (${p.sessionCount}회)` : ''}`,
        href: '/admin/approvals',
      });
    } else if (p.status === 'confirmed') {
      out.push({
        id: `pay-pay-${p.id}`, group: 'pay', tone: 'accent', counts: true,
        title: `강사 페이 지급 대기 — ${name(p.instructorId)}`,
        detail: `${p.periodStart}~${p.periodEnd} · ${won(p.amount)} 지급 처리 필요`,
        href: '/payouts',
      });
    }
  }

  // 학생 상담/등록 요청(counsel status=requested)
  for (const c of s.counselForms.filter((f) => f.status === 'requested')) {
    out.push({
      id: `counsel-${c.id}`, group: 'counsel', tone: 'accent', counts: true,
      title: `학생 등록·상담 요청 — ${c.applicantName}`,
      detail: c.academyExpectation ? c.academyExpectation : '상담 신청 접수 · 배정 필요',
      href: '/counsel',
    });
  }

  // 지출 승인 대기(expense status=requested)
  for (const e of s.expenses.filter((x) => x.status === 'requested')) {
    out.push({
      id: `expense-${e.id}`, group: 'expense', tone: 'attention', counts: true,
      title: `지출 승인 대기 — ${e.title}`,
      detail: `${won(e.amount)} · ${e.spentAt}`,
      href: '/admin/approvals',
    });
  }
  return out;
}

// 강사: 리포트 미작성(진행된 내 수업) + 오늘/다가오는 내 수업
function instructorTasks(s: StoreSlice, instructorId: number): TaskItem[] {
  const today = todayISO();
  const out: TaskItem[] = [];
  const reportedSessionIds = new Set(s.sessionReports.map((r) => r.sessionId));

  // 진행됐는데 리포트 없음 → 시수/페이가 잡히려면 작성 필요
  for (const ses of s.classSessions) {
    if (ses.instructorId !== instructorId) continue;
    if (ses.status === 'held' && !reportedSessionIds.has(ses.id)) {
      out.push({
        id: `report-${ses.id}`, group: 'report', tone: 'danger', counts: true,
        title: `리포트 미작성 — ${ses.topic ?? '수업'}`,
        detail: `${ses.sessionDate} ${ses.startTime ?? ''} · 작성해야 시수가 측정됩니다`,
        href: '/reports',
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

export function buildTasks(s: StoreSlice, role: AccountRole = s.currentRole): { items: TaskItem[]; count: number } {
  let items: TaskItem[] = [];
  if (isAdmin(role)) items = adminTasks(s);
  else if (role === 'instructor') items = instructorTasks(s, DEMO_INSTRUCTOR_ID);
  // 학생/학부모는 운영 할 일 없음(일정은 캘린더에서)
  const count = items.filter((t) => t.counts).length;
  return { items, count };
}
