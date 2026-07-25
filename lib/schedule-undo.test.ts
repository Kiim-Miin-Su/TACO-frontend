// [TBO-63] undo 스택 계약 — pop 순서(LIFO)·최대 100(오래된 것 폐기)·초기화.
import { describe, expect, it } from 'vitest';
import { clearScheduleUndo, popScheduleUndo, pushScheduleUndo, scheduleUndoSize, sanitizeInversePatch } from '@/lib/schedule-undo';

describe('schedule-undo stack', () => {
  it('LIFO pop — 마지막 변동부터 되돌린다', () => {
    clearScheduleUndo();
    pushScheduleUndo({ label: 'a', run: async () => {} });
    pushScheduleUndo({ label: 'b', run: async () => {} });
    expect(popScheduleUndo()?.label).toBe('b');
    expect(popScheduleUndo()?.label).toBe('a');
    expect(popScheduleUndo()).toBeUndefined();
  });
  it('스택 상한 100 — 초과 시 오래된 항목 폐기', () => {
    clearScheduleUndo();
    for (let i = 1; i <= 105; i += 1) pushScheduleUndo({ label: `e${i}`, run: async () => {} });
    expect(scheduleUndoSize()).toBe(100);
    // 남은 가장 오래된 항목은 e6(1~5 폐기), 최신은 e105
    expect(popScheduleUndo()?.label).toBe('e105');
    let last: string | undefined;
    for (;;) { const entry = popScheduleUndo(); if (!entry) break; last = entry.label; }
    expect(last).toBe('e6');
  });
});

describe('sanitizeInversePatch — 자동 held 전이 존중(TBO-66 F2)', () => {
  it('서버가 held로 전이했고 역패치가 scheduled 복원이면 status만 생략(다른 필드 유지)', () => {
    const out = sanitizeInversePatch({ status: 'scheduled', startTime: '10:00' }, 'held');
    expect(out).toEqual({ startTime: '10:00' });
  });
  it('전이가 없으면(서버 status 동일 계열) 역패치 그대로', () => {
    expect(sanitizeInversePatch({ status: 'scheduled' }, 'scheduled')).toEqual({ status: 'scheduled' });
    expect(sanitizeInversePatch({ status: 'held' }, 'canceled')).toEqual({ status: 'held' });
  });
  it('status가 없는 역패치·fresh 미확인(undefined)은 무변', () => {
    expect(sanitizeInversePatch({ topic: 'x' }, 'held')).toEqual({ topic: 'x' });
    expect(sanitizeInversePatch({ status: 'scheduled' }, undefined)).toEqual({ status: 'scheduled' });
  });
});
