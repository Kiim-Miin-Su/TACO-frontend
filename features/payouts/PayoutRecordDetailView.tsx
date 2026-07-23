'use client';
// [TBO-32 C4 2026-07-22 D4] 정산서 **단건 상세** — B7 단건화 규약의 마지막 미적용 도메인 완결.
//  리스트(관리자 전체·강사 본인) 행 클릭 → /payouts/detail/[id]. 재사용(단일 진실원):
//  DetailStates(404/403 표준)·payout-shared(상태 표기·시수)·중앙 훅(usePayout — 강사는 서버가
//  본인만 허용, 타인 403)·won/dateOnly(lib/format)·useTransactions(원장 연결 — 관리자만 구독).
//  구성: 요약(상태·기간·금액 computed vs adjusted)·사유 타임라인(확정/지급/조정/반려/회수)·
//  산정 명세 lines 표·연결 원장 거래.
import Link from 'next/link';
import { Badge, DetailStates, SectionCard, TableWrap } from '@/components/ui';
import { usePayout, useTransactions, useInstructors } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { won, dateOnly } from '@/lib/format';
import { isReversedPayout, payoutDisplayStatus, payoutHours } from '@/features/payouts/payout-shared';
import type { PayoutRow } from '@/lib/api';

// 상태 이력 타임라인 — 정산 행 자체의 스탬프·사유만으로 구성(단일 소스: PayoutRow).
function timelineOf(p: PayoutRow): Array<{ at?: string; label: string; detail?: string }> {
  const rows: Array<{ at?: string; label: string; detail?: string }> = [
    { at: p.createdAt, label: '산정 생성', detail: `${p.sessionCount}회 · ${payoutHours(p.totalMinutes)} · ${won(p.computedAmount)}` },
  ];
  if (p.adjustedAmount != null) rows.push({ at: p.updatedAt, label: '금액 조정', detail: `${won(p.adjustedAmount)}${p.adjustReason ? ` — ${p.adjustReason}` : ''}` });
  if (p.confirmedAt) rows.push({ at: p.confirmedAt, label: '확정' });
  if (p.paidAt) rows.push({ at: p.paidAt, label: '지급 완료', detail: won(p.amount) });
  if (isReversedPayout(p)) rows.push({ at: p.reversedAt, label: '지급 회수', detail: p.reversedReason ?? p.rejectedReason ?? '사유 미기재' });
  else if (p.status === 'rejected') rows.push({ label: '반려', detail: p.rejectedReason ?? '사유 미기재' });
  return rows;
}

export function PayoutRecordDetailView({ payoutId }: { payoutId: number }) {
  const access = useAccountAccess();
  const finance = access.can('finance.access');
  const query = usePayout(payoutId);
  const { data: instructors = [] } = useInstructors();
  // 원장 연결 — 재무 권한만 구독(강사 상세에는 원장 비표시).
  const txQuery = useTransactions();
  const transactions = finance ? (txQuery.data ?? []).filter((t) => (t as { payoutId?: number | null }).payoutId === payoutId) : [];

  return (
    <DetailStates
      query={query}
      notFoundMessage="정산서를 찾을 수 없습니다."
      forbiddenMessage="본인 정산서만 조회할 수 있습니다."
      backHref="/payouts"
      backLabel="정산 목록으로"
    >
      {(p) => {
        const display = payoutDisplayStatus(p);
        const instructorName = instructors.find((i) => i.id === p.instructorId)?.name ?? `강사 ${p.instructorId}`;
        return (
          <div className="space-y-4">
            <SectionCard
              title={`정산서 #${p.id} — ${instructorName}`}
              action={<Badge tone={display.tone}>{display.label}</Badge>}
            >
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-caption text-fg-subtle">기간</div><div className="text-body mono">{p.periodStart} ~ {p.periodEnd}</div></div>
                <div><div className="text-caption text-fg-subtle">시수</div><div className="text-body">{p.sessionCount}회 · {payoutHours(p.totalMinutes)}</div></div>
                <div><div className="text-caption text-fg-subtle">자동 산정액</div><div className="text-body mono">{won(p.computedAmount)}</div></div>
                <div>
                  <div className="text-caption text-fg-subtle">실효 지급액</div>
                  <div className="text-body mono font-semibold">{won(p.amount)}</div>
                  {p.adjustedAmount != null && <div className="text-caption text-attention">조정됨{p.adjustReason ? ` — ${p.adjustReason}` : ''}</div>}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="상태 이력">
              <ul className="p-4 space-y-2">
                {timelineOf(p).map((row, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mono text-caption text-fg-subtle w-24 shrink-0">{row.at ? dateOnly(row.at) : '—'}</span>
                    <span className="text-body font-medium w-20 shrink-0">{row.label}</span>
                    <span className="text-body text-fg-muted">{row.detail ?? ''}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title={`산정 명세 (${p.lines.length})`}>
              <TableWrap minWidth={640}>
                <table className="table">
                  <thead><tr><th>수업일</th><th>코스</th><th>시수</th><th>시급</th><th className="text-right">금액</th></tr></thead>
                  <tbody>
                    {p.lines.map((l) => (
                      <tr key={l.sessionId}>
                        <td className="mono">{l.sessionDate}</td>
                        <td>{l.courseName}</td>
                        <td>{payoutHours(l.durationMinutes)}</td>
                        <td className="mono">{won(l.hourlyRate)}/h</td>
                        <td className="text-right mono">{won(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={4} className="text-right font-medium">합계(자동 산정)</td><td className="text-right mono font-semibold">{won(p.computedAmount)}</td></tr>
                  </tfoot>
                </table>
              </TableWrap>
            </SectionCard>

            {finance && (
              <SectionCard title={`연결 원장 거래 (${transactions.length})`}>
                {transactions.length === 0 ? (
                  <p className="p-4 text-body text-fg-muted">연결된 원장 거래가 없습니다(지급 전).</p>
                ) : (
                  <ul className="p-4 space-y-1.5">
                    {transactions.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 text-body">
                        <Badge tone={t.direction === 'out' ? 'danger' : 'success'}>{t.direction === 'out' ? '출금' : '입금'}</Badge>
                        <span className="mono">{dateOnly((t as { occurredAt?: string; createdAt?: string }).occurredAt ?? (t as { createdAt?: string }).createdAt ?? '')}</span>
                        <span className="text-fg-muted">{(t as { label?: string }).label ?? t.category}</span>
                        <span className="mono ml-auto">{won(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="px-4 pb-3 text-caption text-fg-subtle">원장은 append-only — 회수는 원 출금을 남기고 보상 입금을 추가합니다.</p>
              </SectionCard>
            )}

            <div className="flex justify-between">
              <Link href="/payouts" className="btn btn-sm">← 정산 목록</Link>
              {finance && <Link href={`/payouts/${p.instructorId}`} className="btn btn-sm">강사별 요약 →</Link>}
            </div>
          </div>
        );
      }}
    </DetailStates>
  );
}
