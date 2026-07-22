import type { RecurrenceScope } from '@kms545487/contracts';
import type { AvailabilityUpsertBody, CreateScheduleRequestBody, ScheduleCreateBody } from '@/lib/api';

export type AvailabilityApprovalDraftInput =
  | { action: 'upsert'; body: AvailabilityUpsertBody }
  | { action: 'delete'; targetAvailabilityId: number };

export function buildAvailabilityRequestBody(
  draft: AvailabilityApprovalDraftInput,
  requestReason: string,
): CreateScheduleRequestBody {
  const reason = requestReason.trim();
  if (draft.action === 'delete') {
    return {
      requestKind: 'availability_delete',
      targetAvailabilityId: draft.targetAvailabilityId,
      requestReason: reason,
    };
  }
  return {
    requestKind: 'availability_upsert',
    targetAvailabilityId: draft.body.id,
    availabilityOwnerType: draft.body.ownerType,
    availabilityOwnerId: draft.body.ownerId,
    availabilityKind: draft.body.kind ?? 'available',
    availabilityWeekday: draft.body.weekday,
    availabilityStartTime: draft.body.startTime,
    availabilityEndTime: draft.body.endTime,
    availabilityEffectiveFrom: draft.body.effectiveFrom,
    availabilityEffectiveTo: draft.body.effectiveTo,
    requestReason: reason,
  };
}

export function buildSessionDeleteRequestBody(
  targetSessionId: number,
  requestReason: string,
  scope: RecurrenceScope = 'this',
): CreateScheduleRequestBody {
  return {
    requestKind: 'session_delete',
    targetSessionId,
    requestReason: requestReason.trim(),
    scope,
  };
}

/** 강사 신규 수업 승인 요청 payload — 관리자 전용 확정 필드는 제외하고 입력 가능한 세션 필드를 보존한다. */
export function buildSessionCreateRequestBody(
  body: ScheduleCreateBody,
  instructorId?: number,
): CreateScheduleRequestBody {
  return {
    requestKind: 'session_create',
    courseId: body.courseId,
    instructorId: instructorId ?? body.instructorId,
    roomId: body.roomId,
    sessionDate: body.sessionDate,
    startTime: body.startTime,
    endTime: body.endTime,
    durationMinutes: body.durationMinutes,
    studentIds: body.studentIds,
    topic: body.topic,
    memo: body.memo,
    kind: body.kind,
    mode: body.mode,
  };
}
