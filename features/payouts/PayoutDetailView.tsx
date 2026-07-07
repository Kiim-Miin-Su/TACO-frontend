'use client';
// [TBO-20 20-B] 정산 상세 — 강사별 시수·페이 회차 내역 + 이번 달 산정 미리보기. 관리자 전용.
//  참조 무결성: 읽기=usePayouts(정산서)·usePayoutPreview(적격 산정, held+승인보고서). 편집은 정산 화면에서.
//  시수/적격 규칙은 정산 서비스와 동일(중복 기준 없음). 출결 상세와 상호 링크.
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader, SectionCard, StatCard, TableWrap, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { useInstructors, usePayouts, usePayoutPreview } from '@/lib/queries';
import { isAdmin } from '@/lib/roles';
import { won } from '@/lib/format';
import type { PayoutRowStatus } from '@/lib/api';

const statusLabel: Record<PayoutRowStatus, string> = { pending: '승인대기', confirmed: '승인됨', paid: '지급완료', rejected: '반려' };
const statusTone: Record<PayoutRowStatus, Tone> = { pending: 'attention', confirmed: 'accent', paid: 'success', rejected: 'danger' };
const hrs = (min?: number) => `${((min ?? 0) / 60).toFixed(1)}h`;
const pad2 = (n: number) => String(n).padStart(2, '0');
const thisYm = () => new Date().toISOString().slice(0, 7);
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad2(new Date(y, m, 0).getDate())}` };
};

export function PayoutDetailView({ instructorId }: { instructorId: number }) {
  const role = useTacoStore((s) => s.currentRole);
  const admin = isAdmin(role);
  const { data: instructors = [], isLoading: loadingInst } = useInstructors();
  const { data: allPayouts = [] } = usePayouts();
  const [ym, setYm] = useState(thisYm());
  const range = monthRange(ym);
  const { data: preview } = usePayoutPreview(admin ? instructorId : null, range.from, range.to);

  const instructor = instructors.find((i) => i.id === instructorId);
  const myPayouts = useMemo(
    () => allPayouts.filter((p) => p.instructorId === instructorId).sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
    [allPayouts, instructorId],
  );
  const paidTotal = myPayouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const navMonth = (d: number) => { const [y, m] = ym.split('-').map(Number); setYm(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7)); };
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!admin) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title="정산 상세" sub="관리자(매니저 이상)만 열람할 수 있습니다." />
        <Link href="/" className="btn btn-primary">대시보드로</Link>
      </div>
    );
  }
  if (!loadingInst && !instructor) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <Link href="/payouts" className="text-caption text-fg-muted hover:underline">← 강사 페이</Link>
        <PageHeader title="정산 상세" sub={`강사(id ${instructorId})를 찾을 수 없습니다.`} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <div>
        <Link href="/payouts" className="text-caption text-fg-muted hover:underline">← 강사 페이</Link>
        <PageHeader
          title={`${instructor?.name ?? `강사 #${instructorId}`} — 정산 상세`}
          sub="회차 시수·페이 내역 · 이번 달 산정 미리보기 (적격 = 진행·승인 보고서)"
          actions={<Link href={`/attendance/instructor/${instructorId}`} className="btn btn-sm">출결 상세 →</Link>}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="정산서" value={`${myPayouts.length}건`} />
        <StatCard label="지급 완료 누적" value={won(paidTotal)} tone="success" />
        <StatCard label="이번 달 산정액" value={preview ? won(preview.computedAmount) : '—'} tone="accent" />
        <StatCard label="이번 달 시수" value={preview ? hrs(preview.totalMinutes) : '—'} />
      </div>

      <SectionCard
        title="이번 달 산정 미리보기"
        action={
          <div className="flex items-center gap-1.5">
            <button className="btn btn-sm" onClick={() => navMonth(-1)}>◀</button>
            <span className="mono text-body w-[70px] text-center">{ym}</span>
            <button className="btn btn-sm" onClick={() => navMonth(1)}>▶</button>
          </div>
        }
      >
        {!preview || !preview.lines.length ? (
          <EmptyState message="해당 기간에 적격(진행·승인 보고서) 회차가 없습니다." />
        ) : (
          <TableWrap minWidth={640}>
            <table className="table">
              <thead><tr><th>날짜</th><th>코스</th><th>시수</th><th>시급</th><th className="text-right">금액</th></tr></thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.sessionId}>
                    <td className="mono">{l.sessionDate}</td>
                    <td>{l.courseName}</td>
                    <td className="mono text-fg-muted">{hrs(l.durationMinutes)}</td>
                    <td className="mono text-fg-muted">{won(l.hourlyRate)}</td>
                    <td className="text-right mono font-medium">{won(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={2}>합계 ({preview.sessionCount}회)</td>
                  <td className="mono">{hrs(preview.totalMinutes)}</td>
                  <td></td>
                  <td className="text-right mono">{won(preview.computedAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
        <p className="text-caption text-fg-subtle mt-2">미리보기는 정산서 생성 없이 산정만 — 확정은 강사 페이 화면에서. 시수 적격 = 진행(held)·강사 결석 아님·승인 보고서.</p>
      </SectionCard>

      <SectionCard title={`정산서 내역 (${myPayouts.length})`}>
        {!myPayouts.length ? (
          <EmptyState message="생성된 정산서가 없습니다." />
        ) : (
          <TableWrap minWidth={720}>
            <table className="table">
              <thead><tr><th></th><th>기간</th><th>회차</th><th>시수</th><th>산정액</th><th>실지급</th><th>상태</th></tr></thead>
              <tbody>
                {myPayouts.map((p) => {
                  const isOpen = open.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td><button type="button" className="text-fg-subtle hover:text-accent" onClick={() => toggle(p.id)}>{isOpen ? '▾' : '▸'}</button></td>
                        <td className="mono">{p.periodStart} ~ {p.periodEnd}</td>
                        <td className="mono text-fg-muted">{p.sessionCount}회</td>
                        <td className="mono text-fg-muted">{hrs(p.totalMinutes)}</td>
                        <td className="mono">{won(p.computedAmount)}</td>
                        <td className="mono font-medium">{won(p.amount)}{p.adjustedAmount != null && p.adjustedAmount !== p.computedAmount ? ' *' : ''}</td>
                        <td><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-canvas-subtle">
                            <div className="p-2 space-y-1">
                              {p.adjustReason && <div className="text-caption text-attention">조정 사유: {p.adjustReason}</div>}
                              {p.rejectedReason && <div className="text-caption text-danger">반려 사유: {p.rejectedReason}</div>}
                              <table className="table text-caption">
                                <thead><tr><th>날짜</th><th>코스</th><th>시수</th><th>시급</th><th className="text-right">금액</th></tr></thead>
                                <tbody>
                                  {p.lines.map((l) => (
                                    <tr key={l.sessionId}>
                                      <td className="mono">{l.sessionDate}</td>
                                      <td>{l.courseName}</td>
                                      <td className="mono text-fg-muted">{hrs(l.durationMinutes)}</td>
                                      <td className="mono text-fg-muted">{won(l.hourlyRate)}</td>
                                      <td className="text-right mono">{won(l.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
