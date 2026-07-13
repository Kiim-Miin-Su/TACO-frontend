import type { RecurrenceScope } from '@kms545487/contracts';
import type { AvailabilityUpsertBody, CreateScheduleRequestBody } from '@/lib/api';

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
