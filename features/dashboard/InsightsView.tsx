'use client';
// [참조/처리] 경영 지표(수입·지출) 상세 — 대시보드에서 분리(CEO 전용).
//  [감사 1·2-D 해소 2026-07-24] 상단 자체 재합산 StatCard 3종(입금/출금/미수금) 제거 — C4 잔여였던
//  클라 재계산(전기간 합산인데 '이번 달' 라벨, 미수금은 pending만 집계해 overdue 전량 누락)이
//  같은 화면 하단의 서버 파생(CeoDashboards D1 재무·D2 미수금 aging)과 다른 수치를 동시 노출했다.
//  재무 수치는 이제 서버 파생만 렌더한다(단일 진실원). 원장 리스트는 원장 원본 그대로(파생 아님).
import Link from 'next/link';
import { SectionCard, PageHeader, IconArrowDown, IconArrowUp } from '@/components/ui';
import { won, shortDate } from '@/lib/format';
import { useTransactions } from '@/lib/queries';
import { roleLabel } from '@/lib/roles';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { RevenueCharts } from './RevenueCharts';
import { CeoDashboards } from './CeoDashboards'; // [TBO-60] 대표 대시보드 6종(서버 파생)

export function InsightsView() {
  const access = useAccountAccess();
  const role = access.role ?? 'instructor';
  const { data: transactions = [] } = useTransactions(); // 원장 리스트 표시용(집계는 서버 파생만)

  if (!access.can('finance.access')) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title="경영 지표" sub={`수입·지출·매출 추이는 대표(super_admin)만 열람할 수 있습니다. (현재: ${roleLabel[role]})`} />
        <div><Link href="/" className="btn btn-primary">대시보드로</Link></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="경영 지표"
        sub="수입·지출·매출 추이 (대표 전용)"
        actions={<Link href="/" className="btn btn-sm">← 대시보드</Link>}
      />

      {/* [TBO-60] 대시보드 6종 — D1 재무(서버 financeSummary)·D2 aging·D3 증감·D6 수익성·D4 링크·D5 가동률 */}
      <CeoDashboards />

      <RevenueCharts />

      <SectionCard title="입·출금 원장">
        <ul className="divide-y border-line-muted">
          {transactions.map((t) => {
            const isIn = t.direction === 'in';
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-7 h-7 rounded-full grid place-items-center shrink-0"
                  style={{
                    backgroundColor: isIn ? 'var(--color-success-subtle)' : 'var(--color-attention-subtle)',
                    color: isIn ? 'var(--color-success)' : 'var(--color-attention)',
                  }}
                >
                  {isIn ? <IconArrowDown /> : <IconArrowUp />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body font-medium truncate">{t.label}</div>
                  <div className="text-micro text-fg-subtle uppercase">{t.method} · {shortDate(t.occurredAt)}</div>
                </div>
                <div className={`mono text-body font-semibold ${isIn ? 'text-success' : 'text-fg'}`}>
                  {isIn ? '+' : '−'}{won(t.amount)}
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
