// 출석부 엔진 테스트 — 시수 인정 규칙(출석·지각=인정, 결석·공결·미체크=0)과 매트릭스 정합.
import { describe, expect, it } from 'vitest';
import { buildAttendanceBook, nextAttendanceStatus, hoursLabel } from './attendanceBook';

const S = (id: number, date: string, status: string, studentIds: number[], dur = 90) =>
  ({ id, sessionDate: date, startTime: '16:00', durationMinutes: dur, status, studentIds }) as never;

describe('buildAttendanceBook — 회차×학생 매트릭스 + 누적 시수', () => {
  const sessions = [
    S(1, '2026-07-01', 'held', [1, 2], 90),
    S(2, '2026-07-03', 'held', [1, 2], 120),
    S(3, '2026-07-05', 'makeup', [1], 60), // 보강(진행) — 1번 학생만
    S(4, '2026-07-08', 'scheduled', [1, 2], 90), // 예정 — 표시만, 집계 제외
  ];
  const attendance = [
    { sessionId: 1, studentId: 1, status: 'present' },
    { sessionId: 2, studentId: 1, status: 'late' },
    { sessionId: 3, studentId: 1, status: 'present' },
    { sessionId: 1, studentId: 2, status: 'absent' },
    // 세션2의 학생2는 미체크
  ] as never[];
  const roster = [
    { id: 1, name: '김서연' },
    { id: 2, name: '이준호' },
  ];

  it('열=날짜순 회차(예정 포함 표시), 진행 여부 플래그', () => {
    const { columns } = buildAttendanceBook(sessions, attendance, roster);
    expect(columns.map((c) => c.no)).toEqual([1, 2, 3, 4]);
    expect(columns.map((c) => c.held)).toEqual([true, true, true, false]);
  });

  it('학생1: 출석+지각+보강출석 시수 인정(90+120+60=270분), 출석률 100%', () => {
    const { rows } = buildAttendanceBook(sessions, attendance, roster);
    const r = rows[0];
    expect(r.counts).toMatchObject({ present: 2, late: 1, absent: 0, unchecked: 0 });
    expect(r.attendedMinutes).toBe(270);
    expect(r.totalMinutes).toBe(270);
    expect(r.rate).toBe(100);
    expect(hoursLabel(r.attendedMinutes)).toBe('4.5h');
  });

  it('학생2: 결석·미체크=0 인정, 코호트 밖 회차(보강)는 분모 제외, 출석률 0%', () => {
    const { rows } = buildAttendanceBook(sessions, attendance, roster);
    const r = rows[1];
    expect(r.counts).toMatchObject({ present: 0, absent: 1, unchecked: 1 });
    expect(r.attendedMinutes).toBe(0);
    expect(r.totalMinutes).toBe(210); // 90+120 — 보강(코호트 밖)·예정 제외
    expect(r.rate).toBe(0);
    expect(r.cells[2].inCohort).toBe(false); // 보강 회차는 '-'
  });

  it('예정 회차 셀은 held=false — 집계에 포함되지 않음(위 totalMinutes로 검증)', () => {
    const { rows } = buildAttendanceBook(sessions, attendance, roster);
    expect(rows[0].cells[3].held).toBe(false);
  });
});

describe('nextAttendanceStatus — 셀 클릭 순환', () => {
  it('미체크→출석→지각→결석→공결→출석', () => {
    expect(nextAttendanceStatus(undefined)).toBe('present');
    expect(nextAttendanceStatus('present')).toBe('late');
    expect(nextAttendanceStatus('late')).toBe('absent');
    expect(nextAttendanceStatus('absent')).toBe('excused');
    expect(nextAttendanceStatus('excused')).toBe('present');
  });
});
