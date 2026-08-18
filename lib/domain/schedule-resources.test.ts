import { describe, expect, it } from 'vitest';
import type { ScheduleResources } from '@/types';
import {
  calendarScheduleCourses,
  calendarSubjectOptions,
  coursesForInstructor,
  instructorScheduleRequestEmptyState,
  isInstructorScheduleResource,
  pruneStudentSelection,
  scheduleResourceName,
  selectedParticipantIdsForSubmit,
  studentPickerItemsFromScheduleResources,
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

  it('강사 일정 owner를 대상 역할 헬퍼에서만 판정한다', () => {
    expect(isInstructorScheduleResource({ scheduleOwnerRole: 'instructor' })).toBe(true);
    expect(isInstructorScheduleResource({ scheduleOwnerRole: 'manager' })).toBe(false);
  });
});

describe('schedule resources calendar SSOT', () => {
  it('캘린더 과정 projection의 과목·학생 ID를 숫자 정규형으로 유지한다', () => {
    expect(calendarScheduleCourses(resources)[0]).toMatchObject({ id: 100, subjectId: 7, studentIds: [10] });
  });

  it('강사 요청 scope와 수업·학생 빈 상태를 같은 resource projection에서 구분한다', () => {
    expect(coursesForInstructor(resources, 1).map((course) => course.id)).toEqual([100, 101]);
    expect(instructorScheduleRequestEmptyState(resources, 2, 0)).toMatchObject({ kind: 'no_courses' });
    const noVisibleStudents = {
      ...resources,
      students: [],
    } as ScheduleResources;
    expect(instructorScheduleRequestEmptyState(noVisibleStudents, 1, 100)).toMatchObject({ kind: 'no_students' });
    expect(instructorScheduleRequestEmptyState(resources, 1, 100)).toBeNull();
  });

  it('생성 모달 학생 선택지는 과목과 무관한 활성 학생 전체를 이름순으로 제공한다', () => {
    expect(studentPickerItemsFromScheduleResources(resources)).toEqual([
      { id: 10, name: '김학생' },
      { id: 11, name: '박학생' },
    ]);
  });

  // [TBO-86I-3] 운영 리포트: 원부 삭제/퇴원 후에도 카운트·선택에 유령이 남고, 분모가 수강 roster로
  //  움직이던 결함. 선택은 보이는 재원생으로만 파생하고, 직렬화는 단일 규칙을 따른다.
  it('선택 상태는 보이는 재원생으로만 파생(prune) — 빠진 학생은 자동 정리, 돌아오면 복원', () => {
    const picked = new Set([10, 11, 99]); // 99 = 삭제/퇴원 등으로 리스트에 없음
    expect(pruneStudentSelection(picked, [{ id: 10 }, { id: 11 }])).toEqual(new Set([10, 11]));
    expect(pruneStudentSelection(picked, [{ id: 10 }])).toEqual(new Set([10]));
    // 비파괴 파생 — 리스트가 복원되면(등록 직후 refetch 도착) 선택도 되살아난다
    expect(pruneStudentSelection(picked, [{ id: 10 }, { id: 11 }, { id: 99 }])).toEqual(new Set([10, 11, 99]));
    expect(pruneStudentSelection(new Set(), [{ id: 10 }])).toEqual(new Set());
  });

  it('신규 일정 참가자는 enrollment/roster와 무관하게 항상 정렬된 명시 ID로 직렬화한다', () => {
    expect(selectedParticipantIdsForSubmit(new Set([11, 10]))).toEqual([10, 11]);
    expect(selectedParticipantIdsForSubmit(new Set([10]))).toEqual([10]);
    expect(selectedParticipantIdsForSubmit(new Set())).toEqual([]);
  });

  it('과목 옵션은 scoped course 집합에서 만든다', () => {
    expect(calendarScheduleCourses(resources).map((course) => course.id)).toEqual([100, 101]);
    expect(calendarSubjectOptions(resources)).toEqual([{ id: 7, name: 'Writing', color: undefined }]);
  });
});
