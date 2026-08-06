import { describe, expect, it } from 'vitest';
import type { SessionReport as ApiReport } from '@/lib/api';
import { toStoreReport } from './report-view';

const apiReport = (overrides: Partial<ApiReport> = {}): ApiReport => ({
  id: 4,
  sessionId: 20,
  studentId: 1,
  instructorId: 3,
  subjectId: 10,
  content: 'Vocab #6 문장 만들기',
  progressPage: 'Vocab #6 PDF 12-15p',
  homework: '단어 암기',
  status: 'submitted',
  approvalStatus: 'submitted',
  version: 1,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T01:00:00.000Z',
  context: {
    student: { id: 1, name: '고은성', grade: 7, schoolName: 'TN School' },
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

describe('joined report view', () => {
  it('preserves authored values and the server joined context', () => {
    const result = toStoreReport(apiReport());
    expect(result).toMatchObject({
      content: 'Vocab #6 문장 만들기',
      progressPage: 'Vocab #6 PDF 12-15p',
      homework: '단어 암기',
      context: {
        student: { id: 1, grade: 7 },
        session: { id: 20, sessionDate: '2026-07-16' },
        course: { id: 10 },
        subject: { id: 10, name: 'Writing' },
      },
    });
  });

  it('keeps authored delivery status separate from approval status', () => {
    expect(toStoreReport(apiReport({ status: 'submitted', approvalStatus: 'approved' }))).toMatchObject({
      status: 'submitted',
      approvalStatus: 'approved',
    });
    expect(toStoreReport(apiReport({ status: 'submitted', approvalStatus: 'rejected' }))).toMatchObject({
      status: 'submitted',
      approvalStatus: 'rejected',
    });
  });

  it('infers legacy approval without rewriting delivery status', () => {
    expect(toStoreReport(apiReport({ status: 'sent', approvalStatus: undefined }))).toMatchObject({
      status: 'sent',
      approvalStatus: 'approved',
    });
  });
});
