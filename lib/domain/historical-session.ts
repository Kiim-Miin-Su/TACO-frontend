import type {
  CreateClassSessionInput,
  CreateHistoricalCompletedSessionInput,
} from '@kms545487/contracts';

/** UI 표시용 KST 종료 판정. 최종 권한·시간 검증은 서버 command가 다시 수행한다. */
export function historicalSessionEnded(
  input: Pick<CreateClassSessionInput, 'sessionDate' | 'startTime' | 'durationMinutes'>,
  nowMs: number = Date.now(),
): boolean {
  const startMs = Date.parse(`${input.sessionDate}T${input.startTime}:00+09:00`);
  const endMs = startMs + (input.durationMinutes ?? 60) * 60_000;
  return Number.isFinite(endMs) && endMs <= nowMs;
}

/** 일반 생성 입력에서 서버가 금지하는 status/seriesId를 제거하고 과거 이관 계약으로 승격한다. */
export function historicalCompletedInput(
  input: CreateClassSessionInput,
  required: Pick<CreateHistoricalCompletedSessionInput, 'instructorId' | 'studentIds' | 'importReason'>,
): CreateHistoricalCompletedSessionInput {
  const { status: omittedStatus, seriesId: omittedSeriesId, force: omittedForce, ...base } = input;
  void omittedStatus;
  void omittedSeriesId;
  void omittedForce;
  return {
    ...base,
    instructorId: required.instructorId,
    studentIds: [...new Set(required.studentIds)],
    importReason: required.importReason.trim(),
  };
}
