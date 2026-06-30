import { describe, it, expect } from 'vitest';
import { sessionNeedsReport, pendingReportItemCount, type ReportSlice } from './reports';
import type { ClassSession, Enrollment, SessionReport } from '@/types';

const ses = (p: Partial<ClassSession>): ClassSession => ({
  id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-06-30', startTime: '16:00',
  durationMinutes: 90, status: 'held', ...p,
} as ClassSession);
const enr = (p: Partial<Enrollment>): Enrollment => ({ id: 1, studentId: 1, courseId: 10, status: 'active', enrolledAt: '2026-06-01', ...p } as Enrollment);

const NOW = Date.parse('2026-06-30T17:00:00'); // 16:00~17:30 수업은 아직 진행 중

describe('sessionNeedsReport (강건성: 실제 종료된 수업만)', () => {
  const slice: ReportSlice = { classSessions: [], enrollments: [enr({})], sessionReports: [] };

  it('held지만 아직 안 끝난 수업(16:00~17:30, 현재 17:00) → 리포트 대상 아님', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-30', startTime: '16:00' }), NOW)).toBe(false);
  });

  it('held이고 종료된 수업(어제) → 리포트 대상', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-29', startTime: '16:00' }), NOW)).toBe(true);
  });

  it('예정(scheduled) 수업 → 대상 아님', () => {
    expect(sessionNeedsReport(slice, ses({ sessionDate: '2026-06-20', status: 'scheduled' }), NOW)).toBe(false);
  });

  it('이미 작성(non-draft)된 학생만 있으면 → 대상 아님', () => {
    const reports: SessionReport[] = [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport];
    const s2: ReportSlice = { classSessions: [], enrollments: [enr({})], sessionReports: reports };
    expect(sessionNeedsReport(s2, ses({ sessionDate: '2026-06-29' }), NOW)).toBe(false);
  });
});

describe('pendingReportItemCount (종료된 수업의 미작성 보고서 건수)', () => {
  it('종료된 held 2건(각 1명) − 작성 1 = 1', () => {
    const slice: ReportSlice = {
      classSessions: [ses({ id: 1, sessionDate: '2026-06-29' }), ses({ id: 2, sessionDate: '2026-06-28' })],
      enrollments: [enr({})],
      sessionReports: [{ id: 1, sessionId: 1, studentId: 1, instructorId: 1, content: 'x', status: 'submitted' } as SessionReport],
    };
    expect(pendingReportItemCount(slice, undefined, NOW)).toBe(1); // 세션2만 미작성
  });

  it('아직 안 끝난 수업은 건수에서 제외', () => {
    const slice: ReportSlice = {
      classSessions: [ses({ id: 9, sessionDate: '2026-06-30', startTime: '16:00' })],
      enrollments: [enr({})], sessionReports: [],
    };
    expect(pendingReportItemCount(slice, undefined, NOW)).toBe(0);
  });
});
