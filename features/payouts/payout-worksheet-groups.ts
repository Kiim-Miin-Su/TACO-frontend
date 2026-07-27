import type { PayoutWorksheetRow } from '@/lib/api';

export type PayoutWorksheetGroup = {
  key: string;
  subjectId: number | null;
  subjectName: string;
  courseId: number;
  courseName: string;
  rows: PayoutWorksheetRow[];
  totalMinutes: number;
  effectiveAmount: number;
  unpricedCount: number;
};

export function groupPayoutWorksheetRows(
  rows: readonly PayoutWorksheetRow[],
): PayoutWorksheetGroup[] {
  const groups = new Map<string, PayoutWorksheetGroup>();

  for (const row of rows) {
    const key = `${row.subjectId ?? 'none'}:${row.courseId}`;
    const group = groups.get(key) ?? {
      key,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      courseId: row.courseId,
      courseName: row.courseName,
      rows: [],
      totalMinutes: 0,
      effectiveAmount: 0,
      unpricedCount: 0,
    };
    group.rows.push(row);
    if (row.pricing.effectiveAmount != null) {
      group.totalMinutes += row.durationMinutes;
      group.effectiveAmount += row.pricing.effectiveAmount;
    } else if (row.pricing.kind === 'manual') {
      group.unpricedCount += 1;
    }
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) =>
        `${a.sessionDate}:${a.startTime ?? ''}:${a.sessionId}`.localeCompare(
          `${b.sessionDate}:${b.startTime ?? ''}:${b.sessionId}`,
        )),
    }))
    .sort((a, b) =>
      `${a.subjectName}:${a.courseName}:${a.courseId}`.localeCompare(
        `${b.subjectName}:${b.courseName}:${b.courseId}`,
        'ko-KR',
      ));
}
