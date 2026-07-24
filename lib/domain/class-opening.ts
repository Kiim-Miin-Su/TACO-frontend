import type {
  InstructorAggregate,
  OpenClassInput,
  OpenClassSeriesInput,
  ScheduleRow,
  Subject,
} from '@/types';
import { durationMinutesBetween, weekdayOf } from './schedule';

export type ClassOpeningDraft = {
  subjectName: string;
  instructorId: number | null;
  studentIds: number[];
  hourlyRateOverride: string;
  coursePrice: string;
  isKinder: boolean;
  color?: string;
  roomId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  topic: string;
  memo: string;
  mode: 'in_person' | 'online';
};

export type ClassOpeningRepeat = {
  kind: 'weekly' | 'custom';
  weekdays: number[];
  endsOn: string;
};

const trimOptional = (value: string): string | undefined => value.trim() || undefined;
const moneyOrUndefined = (value: string): number | undefined => value === '' ? undefined : Number(value);

function catalogInput(draft: ClassOpeningDraft) {
  return {
    subjectName: draft.subjectName.trim(),
    instructorId: draft.instructorId as number,
    studentIds: [...draft.studentIds],
    hourlyRateOverride: draft.hourlyRateOverride === '' ? null : Number(draft.hourlyRateOverride),
    coursePrice: moneyOrUndefined(draft.coursePrice),
    isKinder: draft.isKinder,
    color: draft.color,
  };
}

/** 단건 수업 개설 command를 화면 state에서 계약 타입으로 정규화한다. */
export function buildOpenClassInput(draft: ClassOpeningDraft): OpenClassInput {
  return {
    ...catalogInput(draft),
    roomId: draft.roomId ?? undefined,
    sessionDate: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    durationMinutes: durationMinutesBetween(draft.startTime, draft.endTime),
    topic: trimOptional(draft.topic),
    memo: trimOptional(draft.memo),
    status: 'scheduled',
    kind: 'class',
    mode: draft.mode,
    isPublic: false,
  };
}

/** 반복 수업 개설 command를 서버가 occurrence를 발급하는 bulk 계약으로 정규화한다. */
export function buildOpenClassSeriesInput(
  draft: ClassOpeningDraft,
  repeat: ClassOpeningRepeat,
): OpenClassSeriesInput {
  return {
    ...catalogInput(draft),
    roomId: draft.roomId ?? undefined,
    repeat: {
      kind: repeat.kind,
      weekdays: [...new Set(repeat.weekdays)].sort((a, b) => a - b),
      startsOn: draft.date,
      endsOn: repeat.endsOn,
    },
    startTime: draft.startTime,
    endTime: draft.endTime,
    durationMinutes: durationMinutesBetween(draft.startTime, draft.endTime),
    timeZone: 'Asia/Seoul',
    topic: trimOptional(draft.topic),
    memo: trimOptional(draft.memo),
    status: 'scheduled',
    kind: 'class',
    mode: draft.mode,
    isPublic: false,
  };
}

/** DB 수업 최근 사용순을 우선하고, 아직 사용되지 않은 DB 과목은 최신 등록순으로 보충한다. */
export function recentSubjectSuggestions(
  rows: readonly ScheduleRow[],
  subjects: readonly Subject[],
  limit = 10,
): string[] {
  const canonicalName = new Map(
    subjects.map((subject) => [subject.name.trim().toLocaleLowerCase('ko-KR'), subject.name.trim()]),
  );
  const recent = [...rows]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((row) => canonicalName.get(row.subjectName.trim().toLocaleLowerCase('ko-KR')) ?? row.subjectName);
  const catalog = [...subjects].sort((a, b) => Number(b.id) - Number(a.id)).map((subject) => subject.name);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...recent, ...catalog]) {
    const value = raw.trim();
    const key = value.toLocaleLowerCase('ko-KR');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

export function classOpeningOccurrences(
  startsOn: string,
  endsOn: string,
  weekdays: readonly number[],
  limit = 60,
): string[] {
  if (!startsOn || !endsOn || endsOn < startsOn || weekdays.length === 0) return [];
  const result: string[] = [];
  const accepted = new Set(weekdays);
  for (let cursor = startsOn; cursor <= endsOn && result.length < limit; cursor = addDays(cursor, 1)) {
    if (accepted.has(weekdayOf(cursor))) result.push(cursor);
  }
  return result;
}

export function validateClassOpening(
  draft: ClassOpeningDraft,
  instructor?: Pick<InstructorAggregate, 'defaultHourlyRate' | 'canTeachKinder'>,
): string | null {
  const subjectName = draft.subjectName.trim();
  if (!subjectName) return '과목을 입력하세요.';
  if (subjectName.length > 50) return '과목은 50자 이하로 입력하세요.';
  if (draft.instructorId == null) return '담당 강사를 선택하세요.';
  if (draft.startTime === draft.endTime) return '시작과 종료 시각은 달라야 합니다.';
  const duration = durationMinutesBetween(draft.startTime, draft.endTime);
  if (duration < 10 || duration > 480) return '수업 시간은 10분 이상 8시간 이하로 입력하세요.';
  if (draft.hourlyRateOverride !== '' && (!validMoney(draft.hourlyRateOverride) || Number(draft.hourlyRateOverride) === 0)) return '수업 시급은 1원 이상 정수로 입력하세요.';
  if (draft.coursePrice !== '' && !validMoney(draft.coursePrice)) return '수업 정가는 0원 이상 정수로 입력하세요.';
  const effectiveRate = draft.hourlyRateOverride === ''
    ? instructor?.defaultHourlyRate ?? 0
    : Number(draft.hourlyRateOverride);
  if (effectiveRate <= 0) return '강사 기본 시급 또는 수업 시급 override를 1원 이상 입력하세요.';
  // [TBO-61 2026-07-24] Kinder 가능 여부 게이트 제거(대표 지시 '유연하게') — canTeachKinder는 정보 표시용.
  return null;
}

const validMoney = (value: string): boolean => {
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 0 && amount <= 100_000_000;
};

const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
