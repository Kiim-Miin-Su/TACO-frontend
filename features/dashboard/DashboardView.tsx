'use client';
import {
  Badge,
  EmptyState,
  PageHeader,
  StatCard,
  SectionCard,
  StatusDot,
  TableWrap,
  IconBell,
  IconBook,
  IconCalendar,
  IconUsers,
  type Tone,
} from '@/components/ui';
import Link from 'next/link';
import { won, shortDate } from '@/lib/format';
import { useTacoStore } from '@/lib/store';
import { useAppData } from '@/lib/queries';
import { isCEO, isAdmin, roleLabel } from '@/lib/roles';
import { buildTasks, type TaskItem } from '@/lib/tasks';
import { myInstructorId } from '@/lib/auth';
import type { EnrollmentStatus } from '@/types';

// To-do 항목 리스트 — 알림/대시보드 공용 표현. 항목 클릭 시 해당 화면으로.
// [DESIGN §2.4] 항목 폭주 시 카드가 페이지를 밀지 않게 자체 스크롤(max-h-[300px]).
function TaskList({ items, empty }: { items: TaskItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState message={empty} />;
  return (
    <div className="max-h-[300px] overflow-y-auto">
      <ul className="divide-y border-line-muted">
        {items.map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas-subtle">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `var(--color-${t.tone === 'neutral' ? 'fg-subtle' : t.tone})` }} />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-fg truncate">{t.title}</span>
                {t.detail && <span className="block text-caption text-fg-subtle truncate">{t.detail}</span>}
              </span>
              <span className="text-fg-subtle text-body">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 할 일 그룹 메타 — 카드/축약 스트립 공용 정의(회계상 분리: 입금/출금/상담/수업)
const TASK_GROUPS = [
  { key: 'payment', title: '결제 · 수납', href: '/payments', btn: '결제 관리', empty: '재결제 임박·미수 건이 없습니다.' },
  { key: 'pay', title: '강사 페이', href: '/payouts', btn: '강사 페이', empty: '승인·지급 대기 정산이 없습니다.' },
  { key: 'expense', title: '지출 승인', href: '/admin/approvals', btn: '승인 센터', empty: '승인 대기 지출이 없습니다.' },
  { key: 'counsel', title: '상담 배정', href: '/counsel', btn: '상담', empty: '배정 대기(날짜 미정) 상담이 없습니다.' },
  // [UX QA 2026-07-06 H2] 수업 요청(TBO-16 #9) — 배지·승인센터와 같은 모집단
  { key: 'schedule', title: '수업 요청', href: '/admin/approvals', btn: '승인 센터', empty: '승인 대기 수업 요청이 없습니다.' },
] as const;

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

const statusTone: Record<EnrollmentStatus, Tone> = {
  active: 'success',
  paused: 'attention',
  completed: 'done',
  canceled: 'danger',
};
const statusLabel: Record<EnrollmentStatus, string> = {
  active: '수강중',
  paused: '일시정지',
  completed: '수료',
  canceled: '취소',
};

export function DashboardView() {
  // [참조/처리] 서버 데이터(수강·학생·코스 등)는 TanStack Query(useAppData) 단일 소스.
  //  currentRole은 zustand(클라 상태)에서 별도로 읽어 buildTasks에 합성해 넘긴다.
  const appData = useAppData();
  const role = useTacoStore((s) => s.currentRole);
  const ceo = isCEO(role); // 경영 지표(총액·미수금·원장)
  const admin = isAdmin(role); // 운영 데이터
  const { items: tasks, count: taskCount } = buildTasks({ ...appData, currentRole: role }, role, myInstructorId() ?? undefined);

  // 강사: 내 수업·리포트 중심 To-do 대시보드
  if (role === 'instructor') {
    const reportTasks = tasks.filter((t) => t.group === 'report');
    const classTasks = tasks.filter((t) => t.group === 'class' || t.group === 'schedule'); // [UX H2] 내 수업 요청(반려·대기)도 수업 카드에
    return (
      <div className="p-6 max-w-page-form mx-auto space-y-6">
        <PageHeader
          title="내 할 일"
          sub="오늘·다가오는 수업과 작성할 리포트"
          actions={
            <span className="flex items-center gap-2 text-caption text-fg-subtle">
              <span className="dot bg-success" />
              {roleLabel[role]} · 대기 {taskCount}건
            </span>
          }
        />

        <SectionCard title={`리포트 미작성 (${reportTasks.length})`} action={<a href="/reports" className="btn btn-sm">리포트 작성</a>}>
          <TaskList items={reportTasks} empty="작성할 리포트가 없습니다. 진행한 수업의 리포트가 모두 제출되었습니다." />
        </SectionCard>

        <SectionCard title={`오늘 · 다가오는 수업 (${classTasks.length})`} action={<a href="/schedule" className="btn btn-sm">캘린더</a>}>
          <TaskList items={classTasks} empty="예정된 수업이 없습니다." />
        </SectionCard>

        <p className="text-caption text-fg-subtle">진행한 수업은 <b>리포트를 작성·승인</b>받아야 시수로 측정되고 페이가 산정됩니다.</p>
      </div>
    );
  }

  // 학생/학부모는 운영 대시보드 대신 본인 일정으로 안내
  if (!admin) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title={`안녕하세요 (${roleLabel[role]})`} sub="학원 일정과 내 수업을 캘린더에서 확인하세요." />
        <SectionCard title="바로가기">
          <div className="p-4 flex gap-2">
            <a href="/schedule" className="btn btn-primary">학원 캘린더 보기</a>
            <a href="/reports" className="btn">수업 피드백</a>
          </div>
        </SectionCard>
      </div>
    );
  }

  const recent = appData.enrollments
    .slice()
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
    .slice(0, 5)
    .map((e) => {
      const student = appData.students.find((s) => s.id === e.studentId);
      const course = appData.courses.find((c) => c.id === e.courseId);
      return { id: e.id, student, course, status: e.status, amount: course?.price ?? 0, at: e.enrolledAt };
    });

  // 이번 주(월~일) 수업 수 — 지표 행. 날짜는 하드코딩 금지(동적).
  const now = new Date();
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekSessions = appData.classSessions.filter(
    (s) => s.sessionDate >= iso(monday) && s.sessionDate <= iso(sunday),
  ).length;
  const activeEnrollments = appData.enrollments.filter((e) => e.status === 'active').length;

  // [DESIGN §8] 대기>0 그룹만 카드, 0건 그룹은 하단 한 줄 스트립으로 축약
  const grouped = TASK_GROUPS.map((g) => ({ ...g, items: tasks.filter((t) => t.group === g.key) }));
  const activeGroups = grouped.filter((g) => g.items.length > 0);
  const idleGroups = grouped.filter((g) => g.items.length === 0);

  return (
    <div className="p-6 max-w-page mx-auto">
      <PageHeader
        title="대시보드"
        sub={`${monthLabel} · 이번 달 운영 현황`}
        actions={
          <>
            {ceo && <Link href="/insights" className="btn btn-sm">경영 지표 →</Link>}
            <span className="flex items-center gap-2 text-caption text-fg-subtle">
              <span className="dot bg-success" />
              {roleLabel[role]}
            </span>
          </>
        }
      />

      {/* 지표 행 — 운영 중립 지표 4개(경영 금액 지표는 /insights로 분리 유지) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="수강 등록" value={`${appData.enrollments.length}건`} tone="accent" icon={<IconBook />} sub={`활성 ${activeEnrollments}건`} />
        <StatCard label="학생" value={`${appData.students.length}명`} tone="success" icon={<IconUsers />} sub={`학부모 ${appData.parents.length}명`} />
        <StatCard label="이번 주 수업" value={`${weekSessions}회`} tone="done" icon={<IconCalendar />} sub={`${iso(monday).slice(5)} ~ ${iso(sunday).slice(5)}`} />
        <StatCard label="처리 대기" value={`${taskCount}건`} tone={taskCount > 0 ? 'attention' : 'neutral'} icon={<IconBell />} sub={taskCount > 0 ? '아래 카드에서 처리' : '모두 처리됨'} />
      </div>

      {/* 관리자/매니저 할 일 — 회계상 분리: 결제·수납(입금) / 강사 페이·지출(출금) / 상담 / 수업 */}
      <div className="mb-6">
        <h2 className="text-section font-semibold mb-2">할 일 · 처리 대기 <span className="text-fg-subtle font-normal">({taskCount})</span></h2>
        {activeGroups.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
            {activeGroups.map((g) => (
              <SectionCard key={g.key} title={`${g.title} (${g.items.length})`} action={<Link href={g.href} className="btn btn-sm">{g.btn}</Link>}>
                <TaskList items={g.items} empty={g.empty} />
              </SectionCard>
            ))}
          </div>
        )}
        {/* 0건 그룹 축약 스트립 — 빈 카드가 화면을 점유하지 않게(DESIGN §2.4·§8) */}
        {idleGroups.length > 0 && (
          <div className="card px-4 py-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-caption text-fg-subtle">
            <span className="font-medium text-fg-muted shrink-0">대기 없음</span>
            {idleGroups.map((g) => (
              <Link key={g.key} href={g.href} className="hover:underline text-fg-subtle" title={g.empty}>
                ✓ {g.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <SectionCard title="최근 수강 등록" action={<Link href="/students" className="btn btn-sm">학생 관리</Link>}>
        <TableWrap>
          <table className="table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>코스</th>
                  <th>상태</th>
                  <th className="text-right">금액</th>
                  <th className="text-right">등록일</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.student?.name ?? '—'}</div>
                      <div className="text-caption text-fg-subtle">{e.student?.englishName}</div>
                    </td>
                    <td className="text-fg-muted">{e.course?.name ?? '—'}</td>
                    <td>
                      <Badge tone={statusTone[e.status]}>
                        <StatusDot tone={statusTone[e.status]} label={statusLabel[e.status]} />
                      </Badge>
                    </td>
                    <td className="text-right mono">{won(e.amount)}</td>
                    <td className="text-right text-fg-muted mono">{shortDate(e.at)}</td>
                  </tr>
                ))}
              </tbody>
          </table>
        </TableWrap>
      </SectionCard>
    </div>
  );
}
