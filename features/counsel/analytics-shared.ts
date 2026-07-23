// [TBO-30D/30E 2026-07-23] 상담 분석 화면 파생의 **단일 진실원** — 기간 프리셋·퍼널 단계 조립·
//  백분율 표기를 이 모듈 하나가 공급한다(뷰에 사설 계산 금지 규약 — payout-shared·family-shared와 동일).
//  집계 수치 자체는 서버 순수 함수(counsel-analytics)가 권위 — 여기는 "표시용 형태" 파생만 한다.
import type { CounselFunnel } from '@/lib/api';

/** 0~1 비율 → "33.3%" (분석 화면 공통 표기). */
export const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

const pad2 = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export type AnalyticsRangePreset = { key: string; label: string; from: string | null; to: string | null };

/** 기간 프리셋 — 최근 N개월(당월 포함)·전체. 접수일(createdAt) 기준. */
export function analyticsRangePresets(now: Date = new Date()): AnalyticsRangePreset[] {
  const monthsAgoFirst = (months: number) => dayOf(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const today = dayOf(now);
  return [
    { key: '3m', label: '최근 3개월', from: monthsAgoFirst(3), to: today },
    { key: '6m', label: '최근 6개월', from: monthsAgoFirst(6), to: today },
    { key: '12m', label: '최근 12개월', from: monthsAgoFirst(12), to: today },
    { key: 'all', label: '전체', from: null, to: null },
  ];
}

export type FunnelStage = { key: string; label: string; count: number; rate: number };

/**
 * 퍼널 단계 조립 — 접수(전체) → 1회차 진행 → 2회차 이상 → 등록 전환.
 * roundReach(서버 파생)와 statusCounts만 소비, rate는 접수 대비 비율(막대 폭·전환율 라벨 공용).
 */
export function funnelStages(funnel: Pick<CounselFunnel, 'total' | 'roundReach' | 'statusCounts'>): FunnelStage[] {
  const reach = (min: number) => funnel.roundReach.find((row) => row.minRounds === min)?.count ?? 0;
  const rateOf = (count: number) => (funnel.total ? count / funnel.total : 0);
  return [
    { key: 'received', label: '접수', count: funnel.total, rate: funnel.total ? 1 : 0 },
    { key: 'round1', label: '1회차 진행', count: reach(1), rate: rateOf(reach(1)) },
    { key: 'round2', label: '2회차 이상', count: reach(2), rate: rateOf(reach(2)) },
    { key: 'converted', label: '등록 전환', count: funnel.statusCounts.registered, rate: rateOf(funnel.statusCounts.registered) },
  ];
}
