import { describe, expect, it } from 'vitest';
import type { PayoutWorksheetRow } from '@/lib/api';
import { groupPayoutWorksheetRows } from '@/features/payouts/payout-worksheet-groups';

const row = (
  sessionId: number,
  courseId: number,
  subjectId: number | null,
  effectiveAmount: number | null,
): PayoutWorksheetRow => ({
  sessionId,
  sessionDate: sessionId === 1 ? '2026-07-02' : '2026-07-01',
  startTime: '10:00',
  durationMinutes: 60,
  courseId,
  courseName: `코스 ${courseId}`,
  subjectId,
  subjectName: subjectId == null ? '과목 미지정' : `과목 ${subjectId}`,
  hourlyRate: 50000,
  status: 'held',
  instructorAttendance: 'present',
  payoutId: null,
  participants: [],
  pricing: {
    kind: effectiveAmount == null ? 'manual' : 'auto',
    manualReasons: effectiveAmount == null ? ['report_incomplete'] : [],
    autoAmount: effectiveAmount,
    overrideAmount: null,
    effectiveAmount,
  },
});

describe('groupPayoutWorksheetRows', () => {
  it('groups only from server subject/course ids and keeps deterministic session order', () => {
    const groups = groupPayoutWorksheetRows([
      row(1, 10, 1, 50000),
      row(2, 10, 1, null),
      row(3, 20, 2, 70000),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: '1:10',
      totalMinutes: 60,
      effectiveAmount: 50000,
      unpricedCount: 1,
    });
    expect(groups[0].rows.map((item) => item.sessionId)).toEqual([2, 1]);
  });

  it('does not merge courses that share the same subject', () => {
    expect(groupPayoutWorksheetRows([
      row(1, 10, 1, 50000),
      row(2, 11, 1, 50000),
    ])).toHaveLength(2);
  });
});
