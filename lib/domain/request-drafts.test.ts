import { describe, expect, it } from 'vitest';
import { buildAvailabilityRequestBody, buildSessionDeleteRequestBody } from './request-drafts';

describe('request draft builders', () => {
  it('availability_upsert 요청 payload에 사유와 block 필드를 보존', () => {
    expect(buildAvailabilityRequestBody({
      action: 'upsert',
      body: {
        id: 3,
        ownerType: 'instructor',
        ownerId: 1,
        kind: 'online_only',
        weekday: 1,
        startTime: '12:00',
        endTime: '13:00',
        effectiveFrom: '2026-07-13',
        effectiveTo: '2026-07-20',
      },
    }, '  대면 수업과 겹쳐 온라인만 가능 요청  ')).toMatchObject({
      requestKind: 'availability_upsert',
      targetAvailabilityId: 3,
      availabilityOwnerType: 'instructor',
      availabilityOwnerId: 1,
      availabilityKind: 'online_only',
      availabilityWeekday: 1,
      availabilityStartTime: '12:00',
      availabilityEndTime: '13:00',
      availabilityEffectiveFrom: '2026-07-13',
      availabilityEffectiveTo: '2026-07-20',
      requestReason: '대면 수업과 겹쳐 온라인만 가능 요청',
    });
  });

  it('availability_delete 요청 payload에 대상 블록과 사유를 저장', () => {
    expect(buildAvailabilityRequestBody({ action: 'delete', targetAvailabilityId: 11 }, '삭제 필요')).toEqual({
      requestKind: 'availability_delete',
      targetAvailabilityId: 11,
      requestReason: '삭제 필요',
    });
  });

  it('session_delete 요청 payload에 사유와 반복 scope를 저장', () => {
    expect(buildSessionDeleteRequestBody(9, '반복 수업 종료', 'this_and_following')).toEqual({
      requestKind: 'session_delete',
      targetSessionId: 9,
      requestReason: '반복 수업 종료',
      scope: 'this_and_following',
    });
  });
});
