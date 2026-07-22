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
