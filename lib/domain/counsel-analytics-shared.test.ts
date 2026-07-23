// [TBO-30D/30E 2026-07-23] analytics-shared(상담 분석 표시 파생 단일 진실원) 단위 검증.
import { describe, expect, it } from 'vitest';
import { analyticsRangePresets, funnelStages, pct } from '@/features/counsel/analytics-shared';

describe('analytics-shared — 표기·프리셋', () => {
  it('pct — 소수 1자리 백분율', () => {
    expect(pct(0.25)).toBe('25.0%');
    expect(pct(1 / 3)).toBe('33.3%');
    expect(pct(0)).toBe('0.0%');
    expect(pct(1)).toBe('100.0%');
  });

  it('기간 프리셋 — 당월 포함 N개월 1일~오늘, 연 경계 처리, 전체=무제한', () => {
    const presets = analyticsRangePresets(new Date(2026, 6, 23)); // 2026-07-23
    const byKey = Object.fromEntries(presets.map((preset) => [preset.key, preset]));
    expect(byKey['3m']).toMatchObject({ from: '2026-05-01', to: '2026-07-23' });
    expect(byKey['6m']).toMatchObject({ from: '2026-02-01', to: '2026-07-23' });
    expect(byKey['12m']).toMatchObject({ from: '2025-08-01', to: '2026-07-23' }); // 연 경계
    expect(byKey['all']).toMatchObject({ from: null, to: null });
  });
});

describe('analytics-shared — 퍼널 단계 조립', () => {
  const base = {
    total: 4,
    roundReach: [{ minRounds: 0, count: 4 }, { minRounds: 1, count: 3 }, { minRounds: 2, count: 1 }],
    statusCounts: { requested: 1, pending: 1, registered: 1, dropped: 1 },
  };

  it('접수→1회차→2회차+→전환 4단계, rate=접수 대비', () => {
    const stages = funnelStages(base);
    expect(stages.map((stage) => [stage.key, stage.count])).toEqual([
      ['received', 4], ['round1', 3], ['round2', 1], ['converted', 1],
    ]);
    expect(stages[1].rate).toBeCloseTo(0.75);
    expect(stages[3].rate).toBeCloseTo(0.25);
  });

  it('빈 집계 — 0 나눗셈 없이 전 단계 0', () => {
    const stages = funnelStages({ total: 0, roundReach: [], statusCounts: { requested: 0, pending: 0, registered: 0, dropped: 0 } });
    expect(stages.every((stage) => stage.count === 0 && stage.rate === 0)).toBe(true);
  });
});
