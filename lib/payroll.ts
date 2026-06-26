import type { ClassSession, Course } from '@/types';

export type PayoutCalc = { sessionCount: number; totalMinutes: number; amount: number };

// 강사 페이 = Σ (수업 시수[h] × 코스 시급). 진행 완료(held) 수업만 산정.
export function computeInstructorPay(
  sessions: ClassSession[],
  courses: Course[],
  instructorId: number,
  start: string,
  end: string,
): PayoutCalc {
  const inRange = sessions.filter(
    (s) =>
      s.instructorId === instructorId &&
      s.status === 'held' &&
      s.sessionDate >= start &&
      s.sessionDate <= end,
  );
  let totalMinutes = 0;
  let amount = 0;
  for (const s of inRange) {
    const rate = courses.find((c) => c.id === s.courseId)?.hourlyRate ?? 0;
    totalMinutes += s.durationMinutes;
    amount += (s.durationMinutes / 60) * rate;
  }
  return { sessionCount: inRange.length, totalMinutes, amount: Math.round(amount) };
}
