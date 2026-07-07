'use client';
// [TBO-19] 관리자 대시보드 — 강사 출결 현황. 월/기간/강사 필터 + 강사별 카운트·출석률·인정 시수 + 총계.
//  집계는 서버(GET /schedule/instructor-attendance-summary) — DB 이관 시 SQL GROUP BY로 승격(프론트 무변경).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SectionCard, EmptyState, TableWrap } from '@/components/ui';
import { useInstructors, useInstructorAttendanceSummary } from '@/lib/queries';

const pad = (n: number) => String(n).padStart(2, '0');
const thisYm = () => new Date().toISOString().slice(0, 7);
// 월(YYYY-MM) → 그 달 1일·말일
const monthRange = (ym: string): { from: string; to: string } => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
};

export function InstructorAttendanceSummary() {
  const { data: instructors = [] } = useInstructors();
  const [mode, setMode] = useState<'month' | 'custom'>('month');
  const [ym, setYm] = useState(thisYm());
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => monthRange(thisYm()));
  const [instructorId, setInstructorId] = useState<number>(0); // 0 = 전체

  const range = mode === 'month' ? monthRange(ym) : custom;
  const { data, isLoading } = useInstructorAttendanceSummary(range.from, range.to, instructorId || undefined);
  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const navMonth = (d: number) => {
    const [y, m] = ym.split('-').map(Number);
    setYm(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7));
  };
  const label = useMemo(() => (mode === 'month' ? `${ym.replace('-', '년 ')}월` : `${range.from} ~ ${range.to}`), [mode, ym, range]);

  return (
    <SectionCard
      title="강사 출결 현황"
      action={
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex rounded-md overflow-hidden border">
            {(['month', 'custom'] as const).map((k) => (
              <button key={k} className={`btn btn-sm rounded-none border-0 ${mode === k ? 'badge-accent' : ''}`} onClick={() => setMode(k)}>
                {k === 'month' ? '월별' : '기간'}
              </button>
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
          <select className="input h-7 w-28 text-caption" value={instructorId} onChange={(e) => setInstructorId(Number(e.target.value))}>
            <option value={0}>강사 전체</option>
            {instructors.map((i) => (
              <option key={i.id} value={Number(i.id)}>{i.name}</option>
            ))}
          </select>
        </div>
      }
    >
      {/* [TBO-19] 임계 경고 — 이번 기간 강사 결석·지각 발생 시 상단 스트립으로 즉시 인지 */}
      {totals && totals.absent + totals.late > 0 && (
        <div
          className="mb-3 px-3 py-2 rounded-md text-caption flex items-center gap-2"
          style={{ background: 'var(--color-attention-subtle)', color: 'var(--color-attention)' }}
        >
          ⚠ 이번 기간 강사 <b>결석 {totals.absent}건</b> · 지각 {totals.late}건 — 아래 표에서 강사별 확인.
        </div>
      )}
      {isLoading ? (
        <EmptyState message="집계 중…" />
      ) : !rows.length ? (
        <EmptyState message={`${label}에 진행된 회차가 없습니다.`} />
      ) : (
        <TableWrap>
          <table className="table text-body">
            <thead>
              <tr>
                <th className="min-w-[110px]">강사</th>
                <th className="text-center min-w-[70px]">진행</th>
                <th className="text-center min-w-[64px]">출석</th>
                <th className="text-center min-w-[64px]">지각</th>
                <th className="text-center min-w-[64px]">결석</th>
                <th className="text-center min-w-[64px]">보강</th>
                <th className="text-center min-w-[64px]">미표시</th>
                <th className="text-center min-w-[70px]">출석률</th>
                <th className="text-center min-w-[90px]">인정 시수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.instructorId} style={r.absent > 0 ? { background: 'var(--color-danger-subtle)' } : undefined}>
                  <td className="font-medium">
                    <span className="inline-flex items-center gap-1">
                      {/* 클릭 → 강사 출결 상세(회차별) */}
                      <Link href={`/attendance/instructor/${r.instructorId}`} className="text-accent hover:underline" title="출결 상세 보기">{r.instructorName}</Link>
                      {/* 결석 있는 강사 강조 배지 — 계약·시수 관리 주의 대상 */}
                      {r.absent > 0 && <span className="badge text-micro" style={{ background: 'var(--color-danger)', color: '#fff' }} title="결석 발생">⚠ 결석 {r.absent}</span>}
                      {r.absent === 0 && r.late > 0 && <span className="badge text-micro" style={{ background: 'var(--color-attention)', color: '#fff' }} title="지각 발생">지각 {r.late}</span>}
                    </span>
                  </td>
                  <td className="text-center mono">{r.held}</td>
                  <td className="text-center mono text-success">{r.present}</td>
                  <td className="text-center mono text-attention">{r.late}</td>
                  <td className="text-center mono text-danger">{r.absent}</td>
                  <td className="text-center mono text-fg-muted">{r.makeup}</td>
                  <td className="text-center mono text-fg-subtle">{r.unmarked}</td>
                  <td className="text-center mono">{r.attendanceRate == null ? '—' : `${r.attendanceRate}%`}</td>
                  <td className="text-center mono font-semibold">{r.teachingHours}h</td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td>합계 ({totals.instructors}명)</td>
                  <td className="text-center mono">{totals.held}</td>
                  <td className="text-center mono text-success">{totals.present}</td>
                  <td className="text-center mono text-attention">{totals.late}</td>
                  <td className="text-center mono text-danger">{totals.absent}</td>
                  <td className="text-center mono text-fg-muted">{totals.makeup}</td>
                  <td className="text-center mono text-fg-subtle">{totals.unmarked}</td>
                  <td className="text-center mono">—</td>
                  <td className="text-center mono">{totals.teachingHours}h</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableWrap>
      )}
      <p className="text-caption text-fg-subtle mt-2">
        카운트=진행 회차(진행·보강) 기준 · 출석률=(출석+지각)/(출석+지각+결석) · <b>인정 시수</b>=진행(held)·강사 결석 아님만(정산과 동일, 잠정). 상세 편집은 <b>출석부</b>에서.
      </p>
    </SectionCard>
  );
}
