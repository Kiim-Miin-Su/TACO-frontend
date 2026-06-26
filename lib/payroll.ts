import type { ClassSession, Course } from '@/types';

export type PayoutCalc = { sessionCount: number; totalMinutes: number; amount: number };

// 정산 대상 수업 1건씩의 내역 (강사가 어느 날 어떤 강의를 얼마만큼 했는지)
export type PaySessionRow = {
  sessionId: number;
  courseId: number;
  date: string;
  minutes: number;
  rate: number;
  pay: number;
  topic?: string;
};

export function instructorPaySessionRows(
  sessions: ClassSession[],
  courses: Course[],
  instructorId: number,
  start: string,
  end: string,
): PaySessionRow[] {
  return sessions
    .filter((s) => s.instructorId === instructorId && s.status === 'held' && s.sessionDate >= start && s.sessionDate <= end)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((s) => {
      const rate = courses.find((c) => c.id === s.courseId)?.hourlyRate ?? 0;
      return {
        sessionId: s.id,
        courseId: s.courseId,
        date: s.sessionDate,
        minutes: s.durationMinutes,
        rate,
        pay: Math.round((s.durationMinutes / 60) * rate),
        topic: s.topic,
      };
    });
}

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
