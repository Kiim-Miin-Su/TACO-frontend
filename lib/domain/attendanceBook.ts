// ──────────────────────────────────────────────────────────────
// 출석부 엔진(LMS형, 피드백 2026-07-03) — Moodle Attendance·대학 LMS 출석부 패턴.
//  행=학생 · 열=회차(날짜순 세션) 매트릭스 + 행 끝 누적(출석/지각/결석·출석률·누적 시수/총 시수).
// [시수 인정 규칙 — 단일 소스]
//  · 학생 누적 시수: 진행(held·makeup)된 회차에서 출석(present)·지각(late) = durationMinutes 인정,
//    결석(absent)·공결(excused)·미체크 = 0. (지각 인정은 강사 시수 규칙(teachingHours)과 대칭)
//  · 총 시수(분모): 진행된 회차의 durationMinutes 합 — 예정(scheduled) 회차는 표시만 하고 집계 제외.
//  · 강사 누적 강의 시수는 lib/domain/schedule.teachingHours를 그대로 재사용(정산과 동일 — 불일치 방지).
// ──────────────────────────────────────────────────────────────
import type { ClassSession, Attendance, AttendanceStatus } from '@/types';
import { sortByDateAsc } from './lantiv';

export type BookColumn = {
  sessionId: number;
  no: number; // 회차(1부터)
  date: string;
  startTime?: string;
  durationMinutes: number;
  held: boolean; // 진행됨(held·makeup) — 집계 대상
  status: ClassSession['status'];
};

export type BookCell = {
  sessionId: number;
  inCohort: boolean; // 이 학생의 회차인가(코호트 밖 = '-')
  held: boolean;
  status?: AttendanceStatus; // 미체크면 undefined
};

export type BookRow = {
  studentId: number;
  name: string;
  cells: BookCell[];
  counts: Record<AttendanceStatus, number> & { unchecked: number };
  attendedMinutes: number; // 누적 인정 시수(분)
  totalMinutes: number; // 분모: 진행된 본인 회차 시수 합
  rate: number | null; // 출석률 %(present+late / 진행 본인 회차) — 진행 회차 0이면 null
};

const HELD = new Set<ClassSession['status']>(['held', 'makeup']);
const COUNTED: AttendanceStatus[] = ['present', 'late'];

/** 세션 durationMinutes 파생(endTime 우선) — 열·시수 공통. */
const minutesOf = (s: Pick<ClassSession, 'durationMinutes'>) => s.durationMinutes || 0;

/**
 * 코스 1개의 출석부 매트릭스.
 * sessions: 그 코스의 세션들(기간 필터는 호출측), attendance: 전체 출결(세션·학생 조인),
 * roster: 표시할 학생들(코호트 유니버스 — 세션별 studentIds로 개별 회차 소속 판정).
 */
export function buildAttendanceBook(
  sessions: Pick<ClassSession, 'id' | 'sessionDate' | 'startTime' | 'durationMinutes' | 'status'>[] &
    { studentIds?: number[] }[],
  attendance: Pick<Attendance, 'sessionId' | 'studentId' | 'status'>[],
  roster: { id: number; name: string }[],
): { columns: BookColumn[]; rows: BookRow[] } {
  const ordered = sortByDateAsc(sessions as never) as unknown as (typeof sessions[number] & { studentIds?: number[] })[];
  const columns: BookColumn[] = ordered.map((s, i) => ({
    sessionId: Number(s.id),
    no: i + 1,
    date: s.sessionDate,
    startTime: s.startTime,
    durationMinutes: minutesOf(s),
    held: HELD.has(s.status),
    status: s.status,
  }));
  // 출결 조인 인덱스: `${sessionId}|${studentId}` → status
  const att = new Map<string, AttendanceStatus>();
  for (const a of attendance) att.set(`${Number(a.sessionId)}|${Number(a.studentId)}`, a.status);

  const rows: BookRow[] = roster.map((st) => {
    const sid = Number(st.id);
    const counts = { present: 0, late: 0, absent: 0, excused: 0, unchecked: 0 };
    let attendedMinutes = 0;
    let totalMinutes = 0;
    let heldMine = 0;
    const cells: BookCell[] = ordered.map((s) => {
      const inCohort = (s.studentIds ?? []).map(Number).includes(sid);
      const held = HELD.has(s.status);
      const status = inCohort ? att.get(`${Number(s.id)}|${sid}`) : undefined;
      if (inCohort && held) {
        heldMine += 1;
        totalMinutes += minutesOf(s);
        if (status) counts[status] += 1;
        else counts.unchecked += 1;
        if (status && COUNTED.includes(status)) attendedMinutes += minutesOf(s);
      }
      return { sessionId: Number(s.id), inCohort, held, status };
    });
    return {
      studentId: sid,
      name: st.name,
      cells,
      counts,
      attendedMinutes,
      totalMinutes,
      rate: heldMine ? Math.round(((counts.present + counts.late) / heldMine) * 100) : null,
    };
  });
  return { columns, rows };
}

/** 분 → "12.5h" 표기(출석부 누적 시수). */
export const hoursLabel = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;

/** 셀 클릭 순환: 미체크 → 출석 → 지각 → 결석 → 공결 → 출석(해제 API 없음 — upsert 순환). */
export function nextAttendanceStatus(cur?: AttendanceStatus): AttendanceStatus {
  const order: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
  if (!cur) return 'present';
  return order[(order.indexOf(cur) + 1) % order.length];
}
