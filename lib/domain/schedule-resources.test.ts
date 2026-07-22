import { describe, expect, it } from 'vitest';
import type { ScheduleResources } from '@/types';
import {
  calendarEnrollmentRows,
  calendarScheduleCourses,
  calendarSubjectOptions,
  courseRosterFromScheduleResources,
  scheduleResourceName,
} from './schedule-resources';

const resources = {
  instructors: [{ type: 'instructor', id: 1, name: '이강사' }],
  rooms: [],
  students: [
    { type: 'student', id: 10, name: '김학생' },
    { type: 'student', id: 11, name: '박학생' },
  ],
  courses: [
    { id: 100, name: 'Writing A', subjectId: 7, instructorId: 1, subjectName: 'Writing', durationMinutes: 90, studentIds: [10] },
    { id: 101, name: 'Writing B', subjectId: 7, instructorId: 1, subjectName: 'Writing', durationMinutes: 60, studentIds: [11] },
  ],
} as unknown as ScheduleResources;

describe('scheduleResourceName', () => {
  it('대표 일정 owner를 강사와 구분해 표시한다', () => {
    expect(scheduleResourceName({ name: '김대표', scheduleOwnerRole: 'super_admin' })).toBe('김대표 (대표)');
  });

  it('일반 강사와 다른 자원 이름은 그대로 표시한다', () => {
    expect(scheduleResourceName({ name: '이강사', scheduleOwnerRole: 'instructor' })).toBe('이강사');
    expect(scheduleResourceName({ name: 'A강의실' })).toBe('A강의실');
  });
});

describe('schedule resources calendar SSOT', () => {
  it('코스별 roster를 resource student와 조인하고 다른 코스 학생을 섞지 않는다', () => {
    expect(courseRosterFromScheduleResources(resources, 100)).toEqual([{ id: 10, name: '김학생' }]);
  });

  it('과목과 활성 enrollment 투영을 같은 scoped course 집합에서 만든다', () => {
    expect(calendarScheduleCourses(resources).map((course) => course.id)).toEqual([100, 101]);
    expect(calendarSubjectOptions(resources)).toEqual([{ id: 7, name: 'Writing', color: undefined }]);
    expect(calendarEnrollmentRows(resources)).toEqual([
      { studentId: 10, courseId: 100, status: 'active' },
      { studentId: 11, courseId: 101, status: 'active' },
    ]);
  });
});
