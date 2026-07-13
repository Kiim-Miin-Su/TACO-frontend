import { describe, expect, it } from 'vitest';
import type { AvailabilityBlock } from '@/types';
import type { ScheduleRequestEx } from '@/lib/api';
import { availabilityGhostBandsForColumn } from './pending-ghosts';

const block = (p: Partial<AvailabilityBlock>): AvailabilityBlock => ({
  id: 10,
  ownerType: 'instructor',
  ownerId: 1,
  kind: 'available',
  weekday: 1,
  startTime: '09:00',
  endTime: '12:00',
  ...p,
});

const req = (p: Partial<ScheduleRequestEx>): ScheduleRequestEx => ({
  id: 1,
  requesterId: 1,
  status: 'pending',
  requestKind: 'availability_upsert',
  ...p,
} as ScheduleRequestEx);

describe('availabilityGhostBandsForColumn', () => {
  it('availability_upsert pending 요청을 owner/date 컬럼 ghost band로 변환', () => {
    const rows = availabilityGhostBandsForColumn({
      requests: [
        req({
          id: 7,
          availabilityOwnerType: 'instructor',
          availabilityOwnerId: 1,
          availabilityKind: 'online_only',
          availabilityWeekday: 1,
          availabilityStartTime: '12:00',
          availabilityEndTime: '13:00',
          availabilityEffectiveFrom: '2026-07-13',
          availabilityEffectiveTo: '2026-07-20',
        }),
      ],
      blocks: [],
      date: '2026-07-13',
      owner: { type: 'instructor', id: 1 },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id: 7,
        requestKind: 'availability_upsert',
        kind: 'online_only',
        startMin: 720,
        endMin: 780,
      }),
    ]);
  });

  it('owner/date/effective range가 다르면 렌더하지 않음', () => {
    const requests = [
      req({
        id: 8,
        availabilityOwnerType: 'student',
        availabilityOwnerId: 2,
        availabilityKind: 'unavailable',
        availabilityWeekday: 1,
        availabilityStartTime: '12:00',
        availabilityEndTime: '13:00',
        availabilityEffectiveFrom: '2026-07-14',
      }),
    ];
    expect(availabilityGhostBandsForColumn({ requests, blocks: [], date: '2026-07-13', owner: { type: 'student', id: 2 } })).toEqual([]);
    expect(availabilityGhostBandsForColumn({ requests, blocks: [], date: '2026-07-14', owner: { type: 'instructor', id: 2 } })).toEqual([]);
  });

  it('availability_delete는 대상 블록 geometry를 사용', () => {
    const rows = availabilityGhostBandsForColumn({
      requests: [req({ id: 9, requestKind: 'availability_delete', targetAvailabilityId: 44 })],
      blocks: [block({ id: 44, ownerType: 'room', ownerId: 3, kind: 'unavailable', weekday: 1, startTime: '15:00', endTime: '16:30' })],
      date: '2026-07-13',
      owner: { type: 'room', id: 3 },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id: 9,
        requestKind: 'availability_delete',
        kind: 'unavailable',
        startMin: 900,
        endMin: 990,
        targetAvailabilityId: 44,
      }),
    ]);
  });

  it('처리 완료 요청은 ghost로 반환하지 않음', () => {
    expect(availabilityGhostBandsForColumn({
      requests: [
        req({
          id: 10,
          status: 'approved',
          availabilityOwnerType: 'instructor',
          availabilityOwnerId: 1,
          availabilityKind: 'available',
          availabilityWeekday: 1,
          availabilityStartTime: '09:00',
          availabilityEndTime: '10:00',
        }),
      ],
      blocks: [],
      date: '2026-07-13',
      owner: { type: 'instructor', id: 1 },
    })).toEqual([]);
  });
});
