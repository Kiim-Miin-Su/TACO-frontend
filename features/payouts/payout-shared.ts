// [TBO-32 C4 2026-07-22 대표 지시] 정산 표시·판정의 **단일 진실원** — 상태 라벨/톤·회수 판별·
//  시수 표기·월 기간 계산이 PayoutsView·PayoutDetailView(강사별 요약)·PayoutRecordDetailView(단건)·
//  UncoveredBanner·BulkGenerateModal에 전부 이 모듈 하나로 공급된다(종전엔 뷰마다 사본 정의).
import type { Tone } from '@/components/ui';
import type { PayoutRow, PayoutRowStatus } from '@/lib/api';

export const PAYOUT_STATUS_LABEL: Record<PayoutRowStatus, string> = {
  pending: '승인대기', confirmed: '승인됨', paid: '지급완료', rejected: '반려',
};

export const PAYOUT_STATUS_TONE: Record<PayoutRowStatus, Tone> = {
  pending: 'attention', confirmed: 'accent', paid: 'success', rejected: 'danger',
};

/** 지급 회수 판별 — status='rejected' + reversedAt(계약 PayoutStatus 확장 불가 제약 하의 표현). */
export const isReversedPayout = (p: Pick<PayoutRow, 'status'> & { reversedAt?: string }): boolean =>
  p.status === 'rejected' && !!p.reversedAt;

/** 표시용 상태 — 회수됨을 반려와 구분(모든 정산 화면이 같은 문구·톤을 쓴다). */
export function payoutDisplayStatus(p: Pick<PayoutRow, 'status'> & { reversedAt?: string }): { label: string; tone: Tone } {
  if (isReversedPayout(p)) return { label: '회수됨', tone: 'danger' };
  return { label: PAYOUT_STATUS_LABEL[p.status], tone: PAYOUT_STATUS_TONE[p.status] };
}

/** 분 → "1.5h" 표기(정산 화면 공통). */
export const payoutHours = (min?: number): string => `${((min ?? 0) / 60).toFixed(1)}h`;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 해당 월(YYYY-MM 또는 Date)의 1일~말일 — 산정 기본 기간·일괄 산정 모달 공용. */
export function monthPeriod(base?: string | Date): { from: string; to: string } {
  const d = base instanceof Date ? base : base ? new Date(`${base}-01T00:00:00`) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
  };
}

/** 이전 달 YYYY-MM — '전월 일괄 산정' 기본값. */
export function previousMonthYm(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
