import { describe, expect, it } from 'vitest';
import { scheduleFormIssues } from './schedule-form';

const valid = {
  type: 'session' as const,
  courseId: 10,
  instructorId: 1 as const,
  participantCount: 1,
  date: '2026-08-18',
  start: '09:00',
  end: '10:00',
  repeat: 'none' as const,
  customWeekdays: [2],
  occurrencesCount: 1,
  availabilityOwnerId: '' as const,
  historicalImport: false,
  historicalImportEligible: false,
  importReason: '',
};

describe('schedule form issues', () => {
  it('화면 순서대로 모든 필수 오류를 반환한다', () => {
    const issues = scheduleFormIssues({ ...valid, courseId: 0, participantCount: 0, date: '', start: '09:00', end: '09:00' });
    expect(issues.map((issue) => issue.field)).toEqual(['course', 'students', 'date', 'time']);
  });

  it('가용 블록은 대상·시간·커스텀 요일을 같은 validator로 방어한다', () => {
    const issues = scheduleFormIssues({
      ...valid,
      type: 'available',
      availabilityOwnerId: '',
      start: '11:00',
      end: '10:00',
      repeat: 'custom',
      customWeekdays: [],
      occurrencesCount: 0,
    });
    expect(issues.map((issue) => issue.field)).toEqual(['availabilityOwner', 'time', 'weekdays']);
  });

  it('과거 완료 저장은 강사·과거 단건·사유를 추가 검증한다', () => {
    const issues = scheduleFormIssues({
      ...valid,
      instructorId: 'unassigned',
      historicalImport: true,
      historicalImportEligible: false,
      importReason: '1234',
    });
    expect(issues.map((issue) => issue.field)).toEqual(['instructor', 'date', 'importReason']);
  });
});
