import { describe, expect, it } from 'vitest';
import type { ClassSession, Course, Enrollment, SessionReport } from '@kms545487/contracts';
import { filterReportSessions, hasActiveReportFilters } from './report-filters';

const sessions: ClassSession[] = [
  { id: 1, courseId: 10, instructorId: 3, sessionDate: '2026-07-10', durationMinutes: 60, status: 'held', studentIds: [7] },
  { id: 2, courseId: 11, instructorId: 4, sessionDate: '2026-08-10', durationMinutes: 60, status: 'held', studentIds: [8] },
];
const courses: Course[] = [
  { id: 10, subjectId: 2, name: 'Writing', instructorId: 3, price: 0, hourlyRate: 0, isKinder: false, color: '#000000' },
  { id: 11, subjectId: 3, name: 'Math', instructorId: 4, price: 0, hourlyRate: 0, isKinder: false, color: '#000000' },
];
const enrollments: Enrollment[] = [];
const reports: SessionReport[] = [{
  id: 20, sessionId: 1, studentId: 7, instructorId: 3, subjectId: 1,
  content: '작성 당시 영어', status: 'submitted', approvalStatus: 'approved', version: 1,
}];

describe('filterReportSessions', () => {
  it('빈 필터와 실제로 적용된 필터를 구분한다', () => {
    expect(hasActiveReportFilters({})).toBe(false);
    expect(hasActiveReportFilters({ studentId: undefined })).toBe(false);
    expect(hasActiveReportFilters({ from: '2026-07-01' })).toBe(true);
  });

  it('기간·강사·학생 필터를 같은 회차 모집단에 적용한다', () => {
    expect(filterReportSessions({
      sessions, courses, enrollments, reports,
      query: { from: '2026-07-01', to: '2026-07-31', instructorId: 3, studentId: 7 },
    }).map((row) => row.id)).toEqual([1]);
  });

  it('현재 코스 과목보다 작성 당시 report subject snapshot을 우선 검색할 수 있다', () => {
    expect(filterReportSessions({ sessions, courses, enrollments, reports, query: { subjectId: 1 } })
      .map((row) => row.id)).toEqual([1]);
    expect(filterReportSessions({ sessions, courses, enrollments, reports, query: { subjectId: 3 } })
      .map((row) => row.id)).toEqual([2]);
  });
});
