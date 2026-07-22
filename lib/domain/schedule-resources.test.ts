import { describe, expect, it } from 'vitest';
import { scheduleResourceName } from './schedule-resources';

describe('scheduleResourceName', () => {
  it('대표 일정 owner를 강사와 구분해 표시한다', () => {
    expect(scheduleResourceName({ name: '김대표', scheduleOwnerRole: 'super_admin' })).toBe('김대표 (대표)');
  });

  it('일반 강사와 다른 자원 이름은 그대로 표시한다', () => {
    expect(scheduleResourceName({ name: '이강사', scheduleOwnerRole: 'instructor' })).toBe('이강사');
    expect(scheduleResourceName({ name: 'A강의실' })).toBe('A강의실');
  });
});
