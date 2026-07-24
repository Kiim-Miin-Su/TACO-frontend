// [TBO-63] undo 스택 계약 — pop 순서(LIFO)·최대 100(오래된 것 폐기)·초기화.
import { describe, expect, it } from 'vitest';
import { clearScheduleUndo, popScheduleUndo, pushScheduleUndo, scheduleUndoSize } from './schedule-undo';

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
