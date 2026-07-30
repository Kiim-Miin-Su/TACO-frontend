// ──────────────────────────────────────────────────────────────
// 스케줄 엔진 (순수 함수). UI/스토어/백엔드와 분리 — 단위 테스트 용이.
// 백엔드 ScheduleService가 동일 규칙을 재현(1:1). 상세: docs/scheduling.md
// ──────────────────────────────────────────────────────────────
import type { ClassSession, AvailabilityBlock, Conflict, ID } from '@/types';
import { addDaysISO } from '@/lib/format'; // [TBO-69 C4]

const pad = (n: number) => String(n).padStart(2, '0');
/** 2자리 패딩 — 뷰 유틸 공용(감사 D: 파일별 중복 pad 통일용 export). */
export const pad2 = pad;
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** 분 → 'HH:mm' — toMin의 역함수(감사 D: 파일별 중복 fromMin 통일용 export). */
export const fromMin = (mm: number): string => `${pad(Math.floor(mm / 60))}:${pad(mm % 60)}`;
/** 요일 라벨(0=일 ~ 6=토) — 뷰 공용(감사 D: 파일별 중복 WD/WEEK 통일용 export). */
export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
export const addMinutes = (hhmm: string, mins: number): string => {
  const t = toMin(hhmm) + mins;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
/** 시작/종료 벽시각의 진행 분. 종료가 더 이르면 익일 종료로 해석한다. */
export const durationMinutesBetween = (startTime: string, endTime: string): number => {
  const delta = toMin(endTime) - toMin(startTime);
  return delta < 0 ? delta + 1440 : delta;
};
/** 0(일)~6(토). 'YYYY-MM-DD' 기준(결정론적, UTC). */
export const weekdayOf = (dateStr: string): number =>
  new Date(dateStr + 'T00:00:00Z').getUTCDay();

// ── [R-9 2026-07-06] 자정 크로스 수업 정식 지원(옵션 B — 단일 세션 모델) ──
//  세션은 1레코드·sessionDate=시작일(KST). 종료가 자정을 넘으면 BE가 endTime을 **저장하지 않고**
//  durationMinutes로 파생한다('25:00' 같은 무효 HH:mm 금지). FE는 아래 두 헬퍼로 파생·표시(단일 소스).
/** 세션 종료 분 — 시작일 00:00 기준(자정 크로스=1440 초과, 예: 23:00+120분=1500).
 *  endTime 없음 → start+duration. endTime<start(익일 종료 입력) → +1440 래핑. */
export const sessionEndMin = (r: { startTime?: string; endTime?: string; durationMinutes: number }): number => {
  const s = toMin(r.startTime ?? '00:00');
  if (!r.endTime) return s + r.durationMinutes;
  const e = toMin(r.endTime);
  return e < s ? e + 1440 : e;
};
/** 자정 크로스 잔여 종료(익일 벽시계 'HH:mm') — 크로스가 아니면 undefined(24:00 정각 종료 포함). */
export const crossMidnightEnd = (r: { startTime?: string; endTime?: string; durationMinutes: number }): string | undefined => {
  const e = sessionEndMin(r);
  return e > 1440 ? fromMin(e - 1440) : undefined;
};
// [TBO-69 C4] 날짜 산술은 lib/format.addDaysISO 정본(사본 addDaysISO_ 제거)
const dayDiffDays = (a: string, b: string): number =>
  Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000);

/**
 * 특정 날짜에 유효한 가용/불가 블록 — 주기(weekday)+적용기간(effectiveFrom/To)+(선택)소유자 매칭.
 * [단일 소스 2026-07-03] 캘린더 밴드(선택 유저·스플릿 컬럼별)와 추천 엔진이 같은 규칙을 쓰도록 추출.
 */
export function blocksOnDate<
  T extends { weekday: number; effectiveFrom?: string; effectiveTo?: string; ownerType?: string; ownerId?: number | string },
>(blocks: T[], date: string, owner?: { type: string; id: number }): T[] {
  const wd = weekdayOf(date);
  return blocks.filter(
    (b) =>
      b.weekday === wd &&
      (!b.effectiveFrom || date >= b.effectiveFrom) &&
      (!b.effectiveTo || date <= b.effectiveTo) &&
      (!owner || (b.ownerType === owner.type && Number(b.ownerId) === owner.id)),
  );
}

/** 두 시간 구간이 겹치는가(맞닿음은 비겹침). */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);

export type SessionModeForAvailability = 'in_person' | 'online';
export type AvailabilityKindForSchedule = AvailabilityBlock['kind'] | 'online_only';

export function blockRestrictsSession(
  block: Pick<AvailabilityBlock, 'kind'>,
  mode: SessionModeForAvailability = 'in_person',
): boolean {
  const kind = block.kind as AvailabilityKindForSchedule;
  return kind === 'unavailable' || (kind === 'online_only' && mode !== 'online');
}

export type AvailabilitySlotDecision = {
  available: boolean;
  hasAvailableWindow: boolean;
  blockingKind?: Extract<AvailabilityKindForSchedule, 'unavailable' | 'online_only'>;
  blockingBlockId?: ID;
  reason?: 'outside_available' | 'unavailable_overlap' | 'online_only_overlap';
};

export function ownerAvailabilityForSlot(
  blocks: AvailabilityBlock[],
  owner: { type: AvailabilityBlock['ownerType']; id: ID },
  slot: { weekday: number; start: number; end: number; mode?: SessionModeForAvailability },
  opts: { requireAvailable?: boolean } = {},
): AvailabilitySlotDecision {
  const ownerBlocks = blocks.filter((b) => b.ownerType === owner.type && Number(b.ownerId) === Number(owner.id) && b.weekday === slot.weekday);
  const availableWindows = ownerBlocks.filter((b) => b.kind === 'available');
  const hasAvailableWindow = availableWindows.length > 0;
  if (opts.requireAvailable && (!hasAvailableWindow || !availableWindows.some((b) => toMin(b.startTime) <= slot.start && slot.end <= toMin(b.endTime)))) {
    return { available: false, hasAvailableWindow, reason: 'outside_available' };
  }
  const blocking = ownerBlocks.find((b) => blockRestrictsSession(b, slot.mode) && slot.start < toMin(b.endTime) && toMin(b.startTime) < slot.end);
  if (blocking) {
    const kind = blocking.kind as AvailabilityKindForSchedule;
    return {
      available: false,
      hasAvailableWindow,
      blockingKind: kind === 'online_only' ? 'online_only' : 'unavailable',
      blockingBlockId: blocking.id,
      reason: kind === 'online_only' ? 'online_only_overlap' : 'unavailable_overlap',
    };
  }
  return { available: true, hasAvailableWindow };
}

// [TBO-79 G1] 프론트 충돌 엔진(detectConflicts / ConflictCandidate / ConflictCtx)을 제거했다.
//  "BE conflict.util과 동일 규칙 1:1"이라고 적혀 있었지만 실제로는 드리프트해 있었다 —
//  BE는 학생 이중예약(TBO-28C)을 잡는데 FE는 잡지 않았고, capacity 비교 대상과 unavailable
//  detail 문구도 달랐다. 게다가 비테스트 소비자가 0인 사문이었는데, 30k줄짜리 테스트가
//  **틀린 진리표를 고정**하고 있어 언제든 그대로 배선될 수 있었다.
//  충돌 판정의 단일 소스는 서버다 — UI는 `POST /schedule/conflicts`를 쓴다.

export type TeachingHours = { sessions: number; minutes: number; hours: number };

/** 기간 내 시수 집계(회계 입력). 기본은 held+scheduled 포함, instructor/student 필터. */
export function teachingHours(
  sessions: ClassSession[],
  opts: { from?: string; to?: string; instructorId?: ID; statuses?: ClassSession['status'][] } = {},
): TeachingHours {
  const statuses = opts.statuses ?? ['held', 'scheduled', 'makeup'];
  const rows = sessions.filter(
    (s) =>
      (opts.from ? s.sessionDate >= opts.from : true) &&
      (opts.to ? s.sessionDate <= opts.to : true) &&
      (opts.instructorId != null ? s.instructorId === opts.instructorId : true) &&
      statuses.includes(s.status),
  );
  const minutes = rows.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  return { sessions: rows.length, minutes, hours: Math.round((minutes / 60) * 100) / 100 };
}

// ── [TBO-19 시수 정책 · TBO-68 C1 2026-07-26 수렴] ─────────────────────────────────────────
//  강사 **정산 시수(급여 인정)** 규칙 = 실제 진행(held) AND 강사 결석 아님.
//  제외: 미진행(예정·취소·노쇼)·보강(makeup)·강사 결석(absent). 지각=인정(감산 없음).
//  ⚠ FE **의도 잔존 사본 1곳**(BE 정본 = session-accounting.policy.countsForTeachingHours).
//   단건 배지(세션 상세·출결 상세 행)용만 — 집계는 서버 summary/아래 stats 헬퍼로 수렴(TBO-68 C1).
//   동형 계약은 schedule.test.ts 진리표가 고정. contracts minor 게시 때 ScheduleRow 서버 파생
//   필드로 대체 예정(TBO-68 §3 — 그때 이 술어 삭제).
export const countsForPay = (s: Pick<ClassSession, 'status' | 'instructorAttendance'>): boolean =>
  s.status === 'held' && s.instructorAttendance !== 'absent';

export type InstructorAttendanceStats = {
  held: number; // 진행 회차(held·makeup) = 마킹 대상
  counts: { present: number; late: number; absent: number; makeup: number; unmarked: number };
  rate: number | null; // (출석+지각)/(출석+지각+결석) — 분모 0이면 null
  minutes: number; // 인정 시수(countsForPay — held·비결석만, 보강 제외)
  hours: number;
};

/** [TBO-68 C1] 강사 출결·시수 통계 — BE schedule.service.instructorAttendanceSummary와 **동형**
 *  (진리표 vitest 고정). 서버 summary를 못 쓰는 표면 전용(출석부 강사 북 — 강사 본인도 열람하는데
 *  summary 라우트는 관리 지표 ADMIN_ROLES·시수 은닉 정책). 관리자 표면(출결 상세·대시보드)은
 *  서버 summary를 직접 소비한다(로컬 재계산 금지 — 종전 2곳 사본을 이 규약으로 소거). */
export function instructorAttendanceStats(
  sessions: ReadonlyArray<Pick<ClassSession, 'status' | 'instructorAttendance' | 'durationMinutes'>>,
): InstructorAttendanceStats {
  const counts = { present: 0, late: 0, absent: 0, makeup: 0, unmarked: 0 };
  let held = 0;
  let minutes = 0;
  for (const s of sessions) {
    if (s.status === 'held' || s.status === 'makeup') {
      held += 1;
      const a = s.instructorAttendance;
      if (a === 'present' || a === 'late' || a === 'absent' || a === 'makeup') counts[a] += 1;
      else counts.unmarked += 1;
    }
    if (countsForPay(s)) minutes += s.durationMinutes || 0;
  }
  const denom = counts.present + counts.late + counts.absent;
  return {
    held,
    counts,
    rate: denom ? Math.round(((counts.present + counts.late) / denom) * 100) : null,
    minutes,
    hours: Math.round((minutes / 60) * 100) / 100,
  };
}

// [TBO-79 G1] moveCandidate / resizeCandidate 제거 — 둘 다 비테스트 소비자 0인 사문이었다.
//  특히 resizeCandidate는 `toMin(end) - toMin(start)`를 그대로 써서 자정 크로스에서 음수가
//  나왔다(23:00→01:00 = -1320 → 최소값으로 클램프). 같은 모듈 6줄 위의 durationMinutesBetween은
//  +1440 보정을 하는데도 이쪽만 빠져 있었다 — 프로젝트 이력이 경고한 "자정 규칙 사본" 문제의
//  세 번째 변종이 사문으로 남아 있던 자리다.

// ── 슬롯 추천: 가용 ∩ − 점유 → 겹치지 않는 후보 시간 ──
export type SuggestInput = {
  weekStart: string; // 월요일 ISO
  weekdays?: number[]; // 0(일)~6(토), 기본 월~금
  workStart?: string; // 'HH:mm' 기본 09:00
  workEnd?: string; // 기본 21:00
  durationMinutes: number;
  stepMin?: number; // 후보 간격, 기본 30
  instructorId?: ID;
  roomId?: ID;
};
export type SuggestCtx = {
  sessions: ClassSession[]; // 점유(기존 수업)
  blocks?: AvailabilityBlock[]; // 불가시간(Block)
  limit?: number;
};
export type SlotCandidate = { date: string; weekday: number; startTime: string; endTime: string };

/** 강사/강의실이 비어 있고 불가시간과 겹치지 않는 시작 후보를 주별로 생성. */
export function suggestSlots(input: SuggestInput, ctx: SuggestCtx): SlotCandidate[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const ws = toMin(input.workStart ?? '09:00');
  const we = toMin(input.workEnd ?? '21:00');
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 24;
  const dates = weekDates(input.weekStart);
  const out: SlotCandidate[] = [];

  const busy = (date: string, s: number, e: number): boolean => {
    // 기존 수업(같은 강사/강의실) 점유
    for (const ss of ctx.sessions) {
      if (ss.sessionDate !== date || !ss.startTime) continue;
      const sameRes = (input.instructorId != null && ss.instructorId === input.instructorId) ||
        (input.roomId != null && ss.roomId === input.roomId);
      if (!sameRes) continue;
      const se = ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes;
      if (s < se && toMin(ss.startTime) < e) return true;
    }
    // 불가시간(Block)
    const wd = weekdayOf(date);
    for (const b of ctx.blocks ?? []) {
      if (b.kind !== 'unavailable' || b.weekday !== wd) continue;
      const owns = (b.ownerType === 'instructor' && input.instructorId === b.ownerId) ||
        (b.ownerType === 'room' && input.roomId === b.ownerId);
      if (owns && s < toMin(b.endTime) && toMin(b.startTime) < e) return true;
    }
    return false;
  };

  for (const date of dates) {
    if (!wds.includes(weekdayOf(date))) continue;
    for (let s = ws; s + dur <= we; s += step) {
      if (busy(date, s, s + dur)) continue;
      out.push({ date, weekday: weekdayOf(date), startTime: fromMin(s), endTime: fromMin(s + dur) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ── 가용 교집합 추천(Lantiv #7): 학생가용 ∧ 강사가용 − 불가 − 점유 → 주별 후보 ──
// 요일별 분 구간(가용 윈도우).
export type DayWindow = { weekday: number; start: number; end: number };

/** owner의 특정 kind 블록 → 요일별 분 구간 목록. */
export function ownerWindows(
  blocks: AvailabilityBlock[],
  ownerType: AvailabilityBlock['ownerType'],
  ownerId: ID,
  kind: AvailabilityKindForSchedule,
): DayWindow[] {
  return blocks
    .filter((b) => b.ownerType === ownerType && Number(b.ownerId) === Number(ownerId) && (b.kind as AvailabilityKindForSchedule) === kind)
    .map((b) => ({ weekday: b.weekday, start: toMin(b.startTime), end: toMin(b.endTime) }));
}

/**
 * 한 요일의 강사·학생 가용 교집합.
 * - 강사(inst)는 **명시 가용이 필수**(없으면 추천 안 함) → 학생 가용 변경이 강사 시간표로 전이되는 무결성 문제 방지.
 * - 학생(stud)은 미선언 시 근무시간(full)로 간주(학생은 유연). 선언했으면 그 구간으로 제한(겹치는 구간만).
 */
function dayPairWindows(instWins: DayWindow[], studWins: DayWindow[], wd: number, full: [number, number]): [number, number][] {
  const inst = instWins.filter((w) => w.weekday === wd).map((w) => [w.start, w.end] as [number, number]);
  if (!inst.length) return []; // 그 요일 강사 가용 없음 → 후보 없음
  const studForDay = studWins.filter((w) => w.weekday === wd).map((w) => [w.start, w.end] as [number, number]);
  const stud = studForDay.length ? studForDay : [full]; // 학생 미선언 → full
  const out: [number, number][] = [];
  for (const [is, ie] of inst) for (const [ss, se] of stud) {
    const s = Math.max(is, ss, full[0]); const e = Math.min(ie, se, full[1]);
    if (s < e) out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

export type PairSuggestInput = {
  weekStart: string; // 월요일 ISO
  weekdays?: number[]; // 기본 월~금
  workStart?: string; // 기본 09:00
  workEnd?: string; // 기본 21:00
  durationMinutes: number;
  stepMin?: number; // 기본 30
  instructorId: ID;
  studentId?: ID; // 선택(없으면 강사 가용만)
  roomId?: ID; // 선택(강의실 점유·불가도 제외)
};
export type PairSuggestCtx = {
  sessions: ClassSession[]; // 점유(기존 수업)
  blocks: AvailabilityBlock[]; // 가용/불가 전체(소유자 무관)
  limit?: number;
};

/** 학생·강사(+강의실) 가용 교집합에서 불가/점유를 제외한 주별 배정 후보. */
export function suggestPairSlots(input: PairSuggestInput, ctx: PairSuggestCtx): SlotCandidate[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const full: [number, number] = [toMin(input.workStart ?? '09:00'), toMin(input.workEnd ?? '21:00')];
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 24;
  const instAvail = ownerWindows(ctx.blocks, 'instructor', input.instructorId, 'available');
  // 강사가 가용 시간을 선언하지 않았으면 추천 대상에서 제외(무결성: 학생 일정에 끌려가지 않음).
  if (instAvail.length === 0) return [];
  const studAvail = input.studentId != null ? ownerWindows(ctx.blocks, 'student', input.studentId, 'available') : [];

  const blockedBy = (wd: number, s: number, e: number): boolean =>
    ctx.blocks.some((b) => {
      if (b.kind !== 'unavailable' || b.weekday !== wd) return false;
      const owns = (b.ownerType === 'instructor' && b.ownerId === input.instructorId) ||
        (b.ownerType === 'student' && b.ownerId === input.studentId) ||
        (b.ownerType === 'room' && b.ownerId === input.roomId);
      return owns && s < toMin(b.endTime) && toMin(b.startTime) < e;
    });
  const busy = (date: string, s: number, e: number): boolean =>
    ctx.sessions.some((ss) => {
      if (ss.sessionDate !== date || !ss.startTime) return false;
      // 강사 점유 · (지정 시)강의실 점유 · 학생 점유(enriched 행의 studentIds) 모두 제외
      const studentIds = (ss as ClassSession & { studentIds?: ID[] }).studentIds;
      const sameRes =
        ss.instructorId === input.instructorId ||
        (input.roomId != null && ss.roomId === input.roomId) ||
        (input.studentId != null && (studentIds?.includes(input.studentId) ?? false));
      if (!sameRes) return false;
      const se = ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes;
      return s < se && toMin(ss.startTime) < e;
    });

  const out: SlotCandidate[] = [];
  for (const date of weekDates(input.weekStart)) {
    const wd = weekdayOf(date);
    if (!wds.includes(wd)) continue;
    for (const [ws, we] of dayPairWindows(instAvail, studAvail, wd, full)) {
      for (let s = ws; s + dur <= we; s += step) {
        if (blockedBy(wd, s, s + dur) || busy(date, s, s + dur)) continue;
        out.push({ date, weekday: wd, startTime: fromMin(s), endTime: fromMin(s + dur) });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// ── 학생 중심 추천(Lantiv): 학생 스케줄에 맞는 수업·강사 추천 ──
// 학생 가용 − 학생 불가 − 학생 점유 안에서 후보 시간을 만들고,
// 각 코스(=강사)에 대해 강사가 그 시간에 가용한지(instructorFree) 표시.
// 불가능한 강사도 후보로 노출하되 색을 달리해 사용자가 "조정"으로 선택할 수 있게 한다.
type StudentRecoCourse = { id: ID; name: string; instructorId: ID; instructorName?: string; color?: string };
export type StudentRecoInput = {
  weekStart: string;
  weekdays?: number[];
  workStart?: string;
  workEnd?: string;
  durationMinutes: number;
  stepMin?: number;
  studentId: ID;
  courses: StudentRecoCourse[];
  roomId?: ID;
};
export type StudentReco = SlotCandidate & {
  courseId: ID; courseName: string; instructorId: ID; instructorName?: string; color?: string;
  instructorFree: boolean; reason?: string; // instructorFree=false 사유(불가/충돌)
};
export type StudentRecoCtx = {
  sessions: (ClassSession & { studentIds?: ID[] })[];
  blocks: AvailabilityBlock[];
  limit?: number;
};

export function recommendForStudent(input: StudentRecoInput, ctx: StudentRecoCtx): StudentReco[] {
  const wds = input.weekdays ?? [1, 2, 3, 4, 5];
  const step = input.stepMin ?? 30;
  const full: [number, number] = [toMin(input.workStart ?? '09:00'), toMin(input.workEnd ?? '21:00')];
  const dur = input.durationMinutes;
  const limit = ctx.limit ?? 30;
  const studAvail = ownerWindows(ctx.blocks, 'student', input.studentId, 'available');

  const overlapsBlock = (ownerType: AvailabilityBlock['ownerType'], ownerId: ID, wd: number, s: number, e: number) =>
    ctx.blocks.some((b) => b.kind === 'unavailable' && b.ownerType === ownerType && b.ownerId === ownerId &&
      b.weekday === wd && s < toMin(b.endTime) && toMin(b.startTime) < e);
  const studentBusy = (date: string, s: number, e: number) =>
    ctx.sessions.some((ss) => ss.sessionDate === date && ss.startTime && (ss.studentIds ?? []).includes(input.studentId) &&
      s < (ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes) && toMin(ss.startTime) < e);
  const instructorBusy = (instructorId: ID, date: string, s: number, e: number) =>
    ctx.sessions.some((ss) => ss.sessionDate === date && ss.startTime && ss.instructorId === instructorId &&
      s < (ss.endTime ? toMin(ss.endTime) : toMin(ss.startTime) + ss.durationMinutes) && toMin(ss.startTime) < e);
  const instAvailOf = (instructorId: ID) => ownerWindows(ctx.blocks, 'instructor', instructorId, 'available');
  const withinAvail = (wins: DayWindow[], wd: number, s: number, e: number) => {
    const day = wins.filter((w) => w.weekday === wd);
    if (!day.length) return true; // 가용 정의 없음 = 제약 없음
    return day.some((w) => w.start <= s && e <= w.end);
  };

  const out: StudentReco[] = [];
  for (const date of weekDates(input.weekStart)) {
    const wd = weekdayOf(date);
    if (!wds.includes(wd)) continue;
    // 학생 가용 윈도우(없으면 full)
    const dayWins = studAvail.filter((w) => w.weekday === wd).map((w) => [Math.max(w.start, full[0]), Math.min(w.end, full[1])] as [number, number]);
    const windows = dayWins.length ? dayWins : [full];
    for (const [ws, we] of windows) {
      for (let s = ws; s + dur <= we; s += step) {
        const e = s + dur;
        if (overlapsBlock('student', input.studentId, wd, s, e) || studentBusy(date, s, e)) continue;
        for (const c of input.courses) {
          const free = !instructorBusy(c.instructorId, date, s, e) &&
            !overlapsBlock('instructor', c.instructorId, wd, s, e) &&
            withinAvail(instAvailOf(c.instructorId), wd, s, e) &&
            (input.roomId == null || (!overlapsBlock('room', input.roomId, wd, s, e)));
          out.push({
            date, weekday: wd, startTime: fromMin(s), endTime: fromMin(e),
            courseId: c.id, courseName: c.name, instructorId: c.instructorId, instructorName: c.instructorName, color: c.color,
            instructorFree: free, reason: free ? undefined : '강사 시간 조정 필요',
          });
        }
      }
    }
  }
  // 가용 강사 우선 → 날짜/시간 순. 제한.
  out.sort((a, b) => Number(b.instructorFree) - Number(a.instructorFree) || (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return out.slice(0, limit);
}

// ── 학생 → 적합 강사 추천(좌측 패널): 학생가용 ∧ 강사가용 교집합이 있는(블록 비충돌) 강사 ──
export type InstructorMatch = {
  instructorId: ID;
  instructorName?: string;
  subjectName?: string;
  color?: string;
  freeSlots: number; // 학생과 함께 비는 후보 슬롯 수(많을수록 적합)
  sample: SlotCandidate[]; // 상위 후보 미리보기
};
export type InstructorMatchInput = {
  weekStart: string;
  weekdays?: number[];
  workStart?: string;
  workEnd?: string;
  durationMinutes: number;
  stepMin?: number;
  studentId: ID;
  instructors: { id: ID; name?: string; subjectName?: string; color?: string }[]; // 후보(과목 필터는 호출측에서)
};
/** 각 후보 강사에 대해 학생과의 가용 교집합 슬롯을 구해, 1개 이상인 강사만 적합도순으로 추천. */
export function recommendInstructorsForStudent(
  input: InstructorMatchInput,
  ctx: { sessions: (ClassSession & { studentIds?: ID[] })[]; blocks: AvailabilityBlock[] },
): InstructorMatch[] {
  return input.instructors
    .map((ins) => {
      const slots = suggestPairSlots(
        {
          weekStart: input.weekStart, weekdays: input.weekdays, workStart: input.workStart, workEnd: input.workEnd,
          durationMinutes: input.durationMinutes, stepMin: input.stepMin, instructorId: ins.id, studentId: input.studentId,
        },
        { sessions: ctx.sessions, blocks: ctx.blocks, limit: 50 },
      );
      return { instructorId: ins.id, instructorName: ins.name, subjectName: ins.subjectName, color: ins.color, freeSlots: slots.length, sample: slots.slice(0, 3) };
    })
    .filter((m) => m.freeSlots > 0)
    .sort((a, b) => b.freeSlots - a.freeSlots);
}

// ── 겹치는 일정 나란히 배치(구글 캘린더식 레인) ──
// 같은 컬럼(요일/강의실)에서 시간이 겹치는 이벤트를 열로 나눠 lane/lanes 부여.
export type LaneItem = { id: number; start: number; end: number };
export function layoutLanes(items: LaneItem[]): Record<number, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const res: Record<number, { lane: number; lanes: number }> = {};
  let cluster: { id: number; lane: number }[] = [];
  let colsEnd: number[] = [];
  let clusterMaxEnd = -Infinity;
  const flush = () => {
    const lanes = colsEnd.length || 1;
    cluster.forEach((c) => (res[c.id] = { lane: c.lane, lanes }));
    cluster = []; colsEnd = []; clusterMaxEnd = -Infinity;
  };
  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterMaxEnd) flush();
    let lane = colsEnd.findIndex((e) => e <= ev.start);
    if (lane === -1) { lane = colsEnd.length; colsEnd.push(ev.end); }
    else colsEnd[lane] = ev.end;
    cluster.push({ id: ev.id, lane });
    clusterMaxEnd = Math.max(clusterMaxEnd, ev.end);
  }
  flush();
  return res;
}

/** 주(週) 시작(월요일) 기준 7일 날짜 배열. */
export function weekDates(weekStartISO: string): string[] {
  const base = new Date(weekStartISO + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
