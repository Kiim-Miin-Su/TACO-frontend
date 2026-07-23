'use client';
// [TBO-32 C4 2026-07-22] 정산 상태 배지 — payout-shared(단일 진실원)만 소비하는 공용 컴포넌트.
//  종전엔 PayoutsView·PayoutDetailView가 각자 사본 배지를 정의했다(대표 지시: 컴포넌트 분리·재사용).
//  회수됨(rejected+reversedAt)은 툴팁으로 회수 일자를 노출.
import { Badge } from '@/components/ui';
import { dateOnly } from '@/lib/format';
import { isReversedPayout, payoutDisplayStatus } from '@/features/payouts/payout-shared';
import type { PayoutRow } from '@/lib/api';

export function PayoutStatusBadge({ p }: { p: PayoutRow }) {
  const display = payoutDisplayStatus(p);
  const badge = <Badge tone={display.tone}>{display.label}</Badge>;
  return isReversedPayout(p)
    ? <span title={`지급 회수됨 — ${dateOnly(p.reversedAt)}`}>{badge}</span>
    : badge;
}
