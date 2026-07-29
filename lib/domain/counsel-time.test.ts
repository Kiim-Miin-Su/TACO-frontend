import { describe, expect, it } from 'vitest';
import {
  counselKstPartsToInstant,
  formatCounselInstantKst,
  instantToCounselKstParts,
} from './counsel-time';

describe('counsel-time KST instant boundary', () => {
  it('KST date+time을 UTC instant로 저장하고 같은 벽시계로 왕복한다', () => {
    const input = { date: '2026-07-21', time: '09:30' };
    const instant = counselKstPartsToInstant(input);

    expect(instant).toBe('2026-07-21T00:30:00.000Z');
    expect(instantToCounselKstParts(instant)).toEqual(input);
    expect(formatCounselInstantKst(instant)).toBe('2026-07-21 09:30');
  });

  it('UTC 날짜와 KST 날짜가 달라지는 자정 경계를 보존한다', () => {
    expect(instantToCounselKstParts('2026-07-20T15:30:00.000Z')).toEqual({
      date: '2026-07-21',
      time: '00:30',
    });
  });

  it('부분 입력과 존재하지 않는 날짜를 저장하지 않는다', () => {
    expect(counselKstPartsToInstant({ date: '2026-07-21', time: '' })).toBeNull();
    expect(counselKstPartsToInstant({ date: '2026-02-31', time: '09:00' })).toBeNull();
    expect(formatCounselInstantKst(null)).toBe('미정');
  });
});
