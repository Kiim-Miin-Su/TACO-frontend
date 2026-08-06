import { describe, expect, it } from 'vitest';
import type { SessionReportView } from '@kms545487/contracts';
import { formatSessionReportBundle } from './report-bundle';

const report = (overrides: Partial<SessionReportView> = {}): SessionReportView => ({
  id: 4,
  sessionId: 20,
  studentId: 1,
  instructorId: 3,
  content: '오늘 수업 내용',
  progressPage: 'Vocab #6 PDF 12-15p',
  homework: '단어 암기',
  status: 'submitted',
  approvalStatus: 'approved',
  context: {
    student: { id: 1, name: '고은성', grade: 7 },
    session: {
      id: 20,
      sessionDate: '2026-07-16',
      startTime: '15:00',
      endTime: '16:00',
      durationMinutes: 60,
    },
    course: { id: 10, name: 'Writing 1' },
    subject: { id: 10, name: 'Writing' },
    instructor: { id: 3, name: '박강사' },
  },
  ...overrides,
});

describe('formatSessionReportBundle', () => {
  it('formats joined identity, lesson, progress, and homework as one copyable block', () => {
    expect(formatSessionReportBundle(report())).toBe(
      '학생/학년: 고은성 / G7\n' +
      '수업일자 / 과목 / 시간: 2026-07-16 / Writing / 15:00-16:00\n\n' +
      '수업 내용\n오늘 수업 내용\n\n' +
      '진도 페이지\nVocab #6 PDF 12-15p\n\n' +
      '숙제\n단어 암기',
    );
  });

  it('uses course and explicit placeholders when optional joined or authored values are absent', () => {
    expect(formatSessionReportBundle(report({
      content: '  ',
      progressPage: undefined,
      homework: undefined,
      context: {
        ...report().context,
        student: { id: 1, name: '고은성' },
        subject: undefined,
        session: {
          id: 20,
          sessionDate: '2026-07-16',
          durationMinutes: 60,
        },
      },
    }))).toContain('고은성 / 학년 미입력\n수업일자 / 과목 / 시간: 2026-07-16 / Writing 1 / 시간 미입력');
  });
});
