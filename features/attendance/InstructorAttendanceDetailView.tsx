'use client';
// [강사 출결 상세] 특정 강사의 회차별 상세 출결. 관리자 전용.
//  참조 무결성 원칙:
//   · 데이터 단일 소스 = 권위 엔드포인트 /schedule(서버가 instructorId로 필터) — 세션 복제·별도 store 없음.
//   · instructorId 유효성 검증(강사 목록에 없으면 '찾을 수 없음') — 유령 참조 차단.
//   · 카운트/시수는 정산과 동일 규칙(countsForPay/paidTeachingHours) — 이중 기준 없음.
//   · 읽기 전용(진실원은 세션·출석부) — 편집은 출석부/캘린더에서.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader, SectionCard, StatCard, TableWrap, type Tone } from '@/components/ui';
import { useInstructors, useInstructorSessions } from '@/lib/queries';
import { useTacoStore } from '@/lib/store';
import { isAdmin } from '@/lib/roles';
import { paidTeachingHours, countsForPay } from '@/lib/domain/schedule';
import { INSTRUCTOR_ATT_LABEL } from '@/lib/domain/lantiv';
import { WEEKDAYS_KO as WD } from '@/lib/domain/schedule';

const pad = (n: number) => String(n).padStart(2, '0');
const thisYm = () => new Date().toISOString().slice(0, 7);
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
};
const ATT_TONE: Record<string, Tone> = { present: 'success', late: 'attention', absent: 'danger', makeup: 'neutral' };

export function InstructorAttendanceDetailView({ instructorId }: { instructorId: number }) {
  const role = useTacoStore((s) => s.currentRole);
  const admin = isAdmin(role);
  const { data: instructors = [], isLoading: loadingInst } = useInstructors();
  const [mode, setMode] = useState<'month' | 'custom'>('month');
  const [ym, setYm] = useState(thisYm());
  const [custom, setCustom] = useState(() => monthRange(thisYm()));
  const range = mode === 'month' ? monthRange(ym) : custom;

  const { data: sessions = [], isLoading } = useInstructorSessions(admin ? instructorId : null, range.from, range.to);

  // 참조 무결성: 유효한 강사인지 검증(목록 로딩 후에만 판정).
  const instructor = instructors.find((i) => Number(i.id) === instructorId);

  // 진행 회차(held·makeup) = 마킹 대상 · 카운트/시수는 정산 규칙.
  const held = useMemo(
    () => sessions.filter((s) => s.status === 'held' || s.status === 'makeup').sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? ''))),
    [sessions],
  );
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, makeup: 0, unmarked: 0 };
    held.forEach((s) => {
      const a = s.instructorAttendance;
      if (a === 'present' || a === 'late' || a === 'absent' || a === 'makeup') c[a]++;
      else c.unmarked++;
    });
    return c;
  }, [held]);
  const denom = counts.present + counts.late + counts.absent;
  const rate = denom ? Math.round(((counts.present + counts.late) / denom) * 100) : null;
  const hrs = paidTeachingHours(sessions, { instructorId });

  const navMonth = (d: number) => { const [y, m] = ym.split('-').map(Number); setYm(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7)); };

  if (!admin) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title="강사 출결 상세" sub="관리자(매니저 이상)만 열람할 수 있습니다." />
        <Link href="/" className="btn btn-primary">대시보드로</Link>
      </div>
    );
  }
  // 참조 무결성: 강사 목록 로딩 완료 후에도 없으면 유령 id → 안내.
  if (!loadingInst && !instructor) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <Link href="/" className="text-caption text-fg-muted hover:underline">← 대시보드</Link>
        <PageHeader title="강사 출결 상세" sub={`강사(id ${instructorId})를 찾을 수 없습니다.`} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <div>
        <Link href="/" className="text-caption text-fg-muted hover:underline">← 대시보드</Link>
        <PageHeader
          title={`${instructor?.name ?? `강사 #${instructorId}`} — 출결 상세`}
          sub="회차별 강사 출결·인정 시수 (읽기 전용 · 편집은 출석부)"
          actions={
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex rounded-md overflow-hidden border">
                {(['month', 'custom'] as const).map((k) => (
                  <button key={k} className={`btn btn-sm rounded-none border-0 ${mode === k ? 'badge-accent' : ''}`} onClick={() => setMode(k)}>{k === 'month' ? '월별' : '기간'}</button>
                ))}
              </div>
              {mode === 'month' ? (
                <>
                  <button className="btn btn-sm" onClick={() => navMonth(-1)}>◀</button>
                  <span className="mono text-body w-[70px] text-center">{ym}</span>
                  <button className="btn btn-sm" onClick={() => navMonth(1)}>▶</button>
                </>
              ) : (
                <>
                  <input type="date" className="input h-7 w-[130px] text-caption" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                  <span className="text-caption text-fg-subtle">~</span>
                  <input type="date" className="input h-7 w-[130px] text-caption" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                </>
              )}
              <Link href="/attendance" className="btn btn-sm">출석부에서 편집 →</Link>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="진행 회차" value={`${held.length}회`} />
        <StatCard label="출석" value={`${counts.present}`} tone="success" />
        <StatCard label="지각" value={`${counts.late}`} tone="attention" />
        <StatCard label="결석" value={`${counts.absent}`} tone="danger" />
        <StatCard label="출석률" value={rate == null ? '—' : `${rate}%`} />
        <StatCard label="인정 시수" value={`${hrs.hours}h`} tone="accent" />
      </div>

      <SectionCard title={`회차 상세 (${held.length})`}>
        {isLoading ? (
          <EmptyState message="불러오는 중…" />
        ) : !held.length ? (
          <EmptyState message="해당 기간에 진행된 회차가 없습니다." />
        ) : (
          <TableWrap>
            <table className="table text-body">
              <thead>
                <tr>
                  <th className="min-w-[110px]">날짜</th>
                  <th className="min-w-[90px]">시간</th>
                  <th>과목 · 코스</th>
                  <th className="min-w-[90px]">강의실</th>
                  <th className="text-center min-w-[80px]">강사 출결</th>
                  <th className="text-center min-w-[90px]">시수 인정</th>
                </tr>
              </thead>
              <tbody>
                {held.map((s) => {
                  const paid = countsForPay(s);
                  return (
                    <tr key={s.id}>
                      <td className="mono">{s.sessionDate} <span className="text-fg-subtle">({WD[s.weekday]})</span></td>
                      <td className="mono text-fg-muted">{s.startTime ?? '—'}</td>
                      <td>{s.subjectName} · <span className="text-fg-muted">{s.courseName}</span></td>
                      <td className="text-fg-muted">{s.roomName ?? '—'}</td>
                      <td className="text-center">
                        {s.instructorAttendance ? (
                          <Badge tone={ATT_TONE[s.instructorAttendance] ?? 'neutral'}>{INSTRUCTOR_ATT_LABEL[s.instructorAttendance]}</Badge>
                        ) : (
                          <span className="text-fg-subtle text-caption">미표시</span>
                        )}
                      </td>
                      <td className="text-center">
                        {paid ? (
                          <span className="mono text-success">{Math.round((s.durationMinutes / 60) * 100) / 100}h</span>
                        ) : (
                          <span className="text-fg-subtle text-caption">제외{s.instructorAttendance === 'absent' ? '(결석)' : s.status === 'makeup' ? '(보강)' : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="text-caption text-fg-subtle mt-2">시수 인정 = 진행(held)·강사 결석 아님(정산과 동일 규칙). 보강·결석·미진행은 제외(잠정).</p>
      </SectionCard>
    </div>
  );
}
