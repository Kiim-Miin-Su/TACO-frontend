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

/** 생성 모달의 학생 선택지는 별도 학생/수강 전량 query 없이 해당 코스의 DB roster에서만 만든다. */
export function courseRosterFromScheduleResources(
  resources: ScheduleResources,
  courseId: number,
): Array<{ id: number; name: string }> {
  const course = calendarScheduleCourses(resources).find((candidate) => Number(candidate.id) === Number(courseId));
  const students = new Map(resources.students.map((student) => [Number(student.id), student.name]));
  return (course?.studentIds ?? []).map((studentId) => ({
    id: Number(studentId),
    name: students.get(Number(studentId)) ?? `학생 ${studentId}`,
  }));
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
  if (courseRosterFromScheduleResources(resources, courseId).length === 0) {
    return {
      kind: 'no_students',
      message: '선택한 수업에 연결된 학생이 없습니다. 관리자에게 학생 수강 등록을 요청해 주세요.',
    };
  }
  return null;
}

/** 생성 모달용 전체 활성 학생과 선택 과목 수강 여부. 학생과 수강 관계의 의미를 섞지 않는다. */
export function courseStudentOptionsFromScheduleResources(
  resources: ScheduleResources,
  courseId: number,
): Array<{ id: number; name: string; enrolled: boolean }> {
  const enrolledIds = new Set(courseRosterFromScheduleResources(resources, courseId).map((student) => student.id));
  return resources.students.map((student) => ({
    id: Number(student.id),
    name: student.name,
    enrolled: enrolledIds.has(Number(student.id)),
  }));
}

export type StudentPickerItem = { id: number; name: string; enrolled: boolean; description?: string };

/** [TBO-86I Grace ver.2 2.2] 생성 모달 학생 선택 = 재원생 전체 단일 검색 리스트(수강생 먼저).
 *  미수강생을 별도 확장 패널로 숨기지 않고 같은 리스트에서 검색·선택하게 하며, 선택 시 서버
 *  enrollment 생성(자동 연결) 뒤 코호트에 넣는다 — roster 무결성 검사는 그대로 서버가 지킨다.
 *  [TBO-87D owner 지시 2026-08-07] "미수강 — 자동 연결" 표기는 제거(조용한 자동 등록) —
 *  enrolled 플래그는 표기용이 아니라 토글의 자동 연결 분기·수강생 우선 정렬에만 쓴다.
 *  관리자 스코프 전용: 강사 요청 모드는 본인 코스 roster만 사용한다(연결 권한 없음). */
export function studentPickerItemsFromScheduleResources(
  resources: ScheduleResources,
  courseId: number,
): StudentPickerItem[] {
  return [...courseStudentOptionsFromScheduleResources(resources, courseId)]
    .sort((a, b) => Number(b.enrolled) - Number(a.enrolled));
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

/** [TBO-86I-3] 제출 코호트 직렬화 단일 규칙 — 체크한 집합이 수강생 전원과 정확히 일치할 때만
 *  미전송(서버 roster 파생·하위 호환 — 시리즈가 이후 수강 변동을 따라감), 그 외에는 명시 코호트.
 *  빈 선택은 []를 반환하며 제출 차단은 호출부(모달 valid 게이트)가 담당한다 — 서버 규칙상
 *  빈/NULL은 전원 파생이므로 []를 그대로 전송하면 안 된다. */
export function explicitCohortForSubmit(
  picked: ReadonlySet<number>,
  roster: ReadonlyArray<{ id: number }>,
): number[] | undefined {
  const rosterIds = new Set(roster.map((student) => student.id));
  const isFullRoster = picked.size === rosterIds.size && [...picked].every((id) => rosterIds.has(id));
  return isFullRoster ? undefined : [...picked];
}

/** 붙여넣기 코스 재배정용 최소 enrollment 투영. 원천은 course.studentIds 한 곳이다. */
export function calendarEnrollmentRows(resources?: ScheduleResources | null) {
  return calendarScheduleCourses(resources).flatMap((course) =>
    course.studentIds.map((studentId) => ({ studentId, courseId: Number(course.id), status: 'active' as const })),
  );
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
