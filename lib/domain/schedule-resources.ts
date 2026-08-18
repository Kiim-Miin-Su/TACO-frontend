import type { ScheduleResource, ScheduleResources } from '@/types';

export type CalendarScheduleCourse = ScheduleResources['courses'][number] & {
  subjectId: number;
  studentIds: number[];
};

/** `/schedule/resources`의 코스 read model을 캘린더 전 기능이 공유하는 정규형으로 만든다. */
export function calendarScheduleCourses(resources?: ScheduleResources | null): CalendarScheduleCourse[] {
  return (resources?.courses ?? []).map((course) => ({
    ...course,
    subjectId: Number((course as CalendarScheduleCourse).subjectId),
    studentIds: ((course as CalendarScheduleCourse).studentIds ?? []).map(Number),
  }));
}

/** 강사 요청 모드의 수업 scope. `/schedule/resources`가 이미 actor 기준으로 좁힌 값을 다시 명시적으로 결속한다. */
export function coursesForInstructor(
  resources: ScheduleResources,
  instructorId: number,
): CalendarScheduleCourse[] {
  return calendarScheduleCourses(resources).filter((course) => Number(course.instructorId) === Number(instructorId));
}

export type InstructorScheduleRequestEmptyState = {
  kind: 'no_courses' | 'no_students';
  message: string;
};

/** 강사 승인 요청의 서로 다른 빈 상태를 한 곳에서 판정한다. 화면은 이 값을 안내와 submit 방어에 함께 쓴다. */
export function instructorScheduleRequestEmptyState(
  resources: ScheduleResources,
  instructorId: number,
  courseId: number,
): InstructorScheduleRequestEmptyState | null {
  const courses = coursesForInstructor(resources, instructorId);
  if (courses.length === 0) {
    return {
      kind: 'no_courses',
      message: '본인에게 연결된 수업이 없습니다. 관리자에게 수업 과정과 담당 강사 연결을 요청해 주세요.',
    };
  }
  if (resources.students.length === 0) {
    return {
      kind: 'no_students',
      message: '수업 참가자로 선택할 수 있는 학생이 없습니다. 관리자에게 학생 조회 권한을 확인해 달라고 요청해 주세요.',
    };
  }
  return null;
}

export type StudentPickerItem = { id: number; name: string };

/** 생성 모달 학생 선택 = 현재 역할이 조회할 수 있는 활성 학생 전체. 과목/수강과 독립한다. */
export function studentPickerItemsFromScheduleResources(
  resources: ScheduleResources,
): StudentPickerItem[] {
  return resources.students
    .map((student) => ({ id: Number(student.id), name: student.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id - b.id);
}

/** [TBO-86I-3] 선택 상태는 화면에 보이는 재원생으로만 파생(prune) — 원부 삭제·퇴원 전이·과목
 *  전환으로 리스트에서 빠진 학생이 선택/카운트/제출에 유령으로 남지 않게 한다(비파괴 파생:
 *  등록 직후처럼 아직 refetch 전인 학생은 리스트에 돌아오면 선택이 자동 복원된다). */
export function pruneStudentSelection(
  picked: ReadonlySet<number>,
  items: ReadonlyArray<{ id: number }>,
): Set<number> {
  const visible = new Set(items.map((item) => item.id));
  return new Set([...picked].filter((id) => visible.has(id)));
}

/** 신규 일정은 선택 참가자를 항상 명시한다. enrollment/roster fallback은 legacy read에만 남긴다. */
export function selectedParticipantIdsForSubmit(
  picked: ReadonlySet<number>,
): number[] {
  return [...new Set([...picked].map(Number))].sort((a, b) => a - b);
}

/** 과목 split 옵션도 담당 코스 read model에서만 파생한다. */
export function calendarSubjectOptions(resources?: ScheduleResources | null) {
  const byId = new Map<number, { id: number; name: string; color?: string }>();
  for (const course of calendarScheduleCourses(resources)) {
    if (!Number.isInteger(course.subjectId) || byId.has(course.subjectId)) continue;
    byId.set(course.subjectId, { id: course.subjectId, name: course.subjectName, color: course.color });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 캘린더 전 화면에서 일정 담당자 이름을 같은 규칙으로 표시한다. */
export function scheduleResourceName(resource: Pick<ScheduleResource, 'name' | 'scheduleOwnerRole'>): string {
  return resource.scheduleOwnerRole === 'super_admin' ? `${resource.name} (대표)` : resource.name;
}

/** 일정 소유자 중 강사만 고르는 대상-role 판정. 로그인 actor 인가는 capability가 담당한다. */
export function isInstructorScheduleResource(resource: Pick<ScheduleResource, 'scheduleOwnerRole'>): boolean {
  return resource.scheduleOwnerRole === 'instructor';
}
