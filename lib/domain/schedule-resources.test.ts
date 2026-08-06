import { describe, expect, it } from 'vitest';
import type { ScheduleResources } from '@/types';
import {
  calendarEnrollmentRows,
  calendarScheduleCourses,
  calendarSubjectOptions,
  courseRosterFromScheduleResources,
  courseStudentOptionsFromScheduleResources,
  explicitCohortForSubmit,
  isInstructorScheduleResource,
  pruneStudentSelection,
  scheduleResourceName,
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
  it('코스별 roster를 resource student와 조인하고 다른 코스 학생을 섞지 않는다', () => {
    expect(courseRosterFromScheduleResources(resources, 100)).toEqual([{ id: 10, name: '김학생' }]);
    expect(courseStudentOptionsFromScheduleResources(resources, 100)).toEqual([
      { id: 10, name: '김학생', enrolled: true },
      { id: 11, name: '박학생', enrolled: false },
    ]);
  });

  // [TBO-86I Grace ver.2 2.2] 스케줄 추가 모달 학생 리스트가 roster로 좁혀져 재원생이 안 보이던 결함.
  //  선택지는 항상 재원생 전체(수강생 먼저)여야 하고 미수강생은 자동 연결 안내를 달고 같은 리스트에 나온다.
  it('생성 모달 학생 선택지는 재원생 전체를 한 리스트로 — 수강생 먼저, 미수강생은 자동 연결 표기', () => {
    expect(studentPickerItemsFromScheduleResources(resources, 101)).toEqual([
      { id: 11, name: '박학생', enrolled: true },
      { id: 10, name: '김학생', enrolled: false, description: '미수강 — 선택하면 이 과목에 자동 연결' },
    ]);
    // 미수강생을 숨기지 않는다: 어떤 코스를 골라도 항목 수 = 재원생 전체 수.
    expect(studentPickerItemsFromScheduleResources(resources, 100)).toHaveLength(2);
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

  it('제출 코호트 — 수강생 전원과 정확히 일치할 때만 미전송(파생), 그 외 명시 코호트', () => {
    const roster = [{ id: 10 }, { id: 11 }];
    expect(explicitCohortForSubmit(new Set([10, 11]), roster)).toBeUndefined(); // 전원 = 파생 하위 호환
    expect(explicitCohortForSubmit(new Set([10]), roster)).toEqual([10]); // 부분 = 명시
    // 크기만 같고 구성원이 다르면(방금 자동 연결돼 roster refetch 전) 명시 코호트로 보낸다
    expect(explicitCohortForSubmit(new Set([10, 12]), roster)).toEqual([10, 12]);
    expect(explicitCohortForSubmit(new Set(), roster)).toEqual([]); // 차단은 모달 valid 게이트 담당
    expect(explicitCohortForSubmit(new Set(), [])).toBeUndefined(); // roster 0 + 선택 0 = 파생(빈 코스)
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
