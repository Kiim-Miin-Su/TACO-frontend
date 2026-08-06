import { describe, expect, it } from 'vitest';
import { historicalCompletedInput, historicalSessionEnded } from './historical-session';

describe('[TBO-86D] 과거 완료 수업 UI command', () => {
  it('KST 종료 시각을 기준으로 과거 여부를 판정한다', () => {
    const now = Date.parse('2026-08-06T07:00:00Z'); // 16:00 KST
    expect(historicalSessionEnded({ sessionDate: '2026-08-06', startTime: '14:00', durationMinutes: 60 }, now)).toBe(true);
    expect(historicalSessionEnded({ sessionDate: '2026-08-06', startTime: '15:30', durationMinutes: 60 }, now)).toBe(false);
  });

  it('일반 create의 status/seriesId를 제거하고 담당 강사·참가자·사유를 명시한다', () => {
    expect(historicalCompletedInput({
      courseId: 10,
      sessionDate: '2026-07-01',
      startTime: '10:00',
      durationMinutes: 60,
      status: 'canceled',
      seriesId: 99,
      force: true,
    }, {
      instructorId: 1,
      studentIds: [1, 1, 4],
      importReason: '  기존 수업 이관  ',
    })).toEqual({
      courseId: 10,
      sessionDate: '2026-07-01',
      startTime: '10:00',
      durationMinutes: 60,
      instructorId: 1,
      studentIds: [1, 4],
      importReason: '기존 수업 이관',
    });
  });
});
