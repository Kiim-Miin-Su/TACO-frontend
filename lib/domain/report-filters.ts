import type {
  ClassSession,
  Course,
  Enrollment,
  ReportWorklistQuery,
  SessionReport,
} from '@kms545487/contracts';
import { rosterStudentIds } from '@/lib/reports';

type ReportSessionFilterInput = {
  sessions: readonly ClassSession[];
  courses: readonly Course[];
  enrollments: readonly Enrollment[];
  reports: readonly SessionReport[];
  query: ReportWorklistQuery;
};

/** 전역 배지 모집단과 사용자가 좁힌 화면 모집단을 구분한다. */
export function hasActiveReportFilters(query: ReportWorklistQuery): boolean {
  return Object.values(query).some((value) => value !== undefined && value !== null && value !== '');
}

/** 보고서 캘린더와 작성 화면의 회차 필터 단일 구현. */
export function filterReportSessions(input: ReportSessionFilterInput): ClassSession[] {
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const reportSubjectBySession = new Map<number, Set<number>>();
  for (const report of input.reports) {
    if (report.subjectId == null) continue;
    const ids = reportSubjectBySession.get(report.sessionId) ?? new Set<number>();
    ids.add(report.subjectId);
    reportSubjectBySession.set(report.sessionId, ids);
  }

  return input.sessions.filter((session) => {
    if (input.query.from && session.sessionDate < input.query.from) return false;
    if (input.query.to && session.sessionDate > input.query.to) return false;
    if (input.query.instructorId != null && session.instructorId !== input.query.instructorId) return false;
    if (input.query.subjectId != null) {
      const snapshotMatches = reportSubjectBySession.get(session.id)?.has(input.query.subjectId) ?? false;
      const currentMatches = courseById.get(session.courseId)?.subjectId === input.query.subjectId;
      if (!snapshotMatches && !currentMatches) return false;
    }
    if (input.query.studentId != null
      && !rosterStudentIds({ enrollments: input.enrollments as Enrollment[] }, session).includes(input.query.studentId)) {
      return false;
    }
    return true;
  });
}
