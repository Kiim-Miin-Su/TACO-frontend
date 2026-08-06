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
 *  관리자 스코프 전용: 강사 요청 모드는 본인 코스 roster만 사용한다(연결 권한 없음). */
export function studentPickerItemsFromScheduleResources(
  resources: ScheduleResources,
  courseId: number,
): StudentPickerItem[] {
  return [...courseStudentOptionsFromScheduleResources(resources, courseId)]
    .sort((a, b) => Number(b.enrolled) - Number(a.enrolled))
    .map((student) =>
      student.enrolled ? student : { ...student, description: '미수강 — 선택하면 이 과목에 자동 연결' },
    );
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
