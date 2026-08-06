import { describe, expect, it } from 'vitest';
import {
  buildAvailabilityRequestBody,
  buildInstructorAttendanceCorrectionRequestBody,
  buildSessionCreateRequestBatch,
  buildSessionCreateRequestBody,
  buildSessionDeleteRequestBody,
} from './request-drafts';

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

  it('강사 출결 정정 요청은 대상·목표 출결·trim 사유만 전송한다', () => {
    expect(buildInstructorAttendanceCorrectionRequestBody(91, 'late', '  실제로는 지각했습니다.  ')).toEqual({
      requestKind: 'instructor_attendance_correction',
      targetSessionId: 91,
      requestedInstructorAttendance: 'late',
      requestReason: '실제로는 지각했습니다.',
    });
  });

  it('session_create 요청은 메모·코호트·종류·방식을 보존하고 관리자 확정 필드는 제외', () => {
    expect(buildSessionCreateRequestBody({
      courseId: 10,
      instructorId: 2,
      roomId: 3,
      sessionDate: '2026-07-23',
      startTime: '16:00',
      endTime: '17:00',
      durationMinutes: 60,
      studentIds: [7],
      topic: '진단 범위',
      memo: '교재 지참',
      kind: 'level_test',
      mode: 'online',
      status: 'held',
      isPublic: true,
      price: 30_000,
      color: '#0969da',
    }, 1)).toEqual({
      requestKind: 'session_create',
      courseId: 10,
      instructorId: 1,
      roomId: 3,
      sessionDate: '2026-07-23',
      startTime: '16:00',
      endTime: '17:00',
      durationMinutes: 60,
      studentIds: [7],
      topic: '진단 범위',
      memo: '교재 지참',
      kind: 'level_test',
      mode: 'online',
    });
  });

  it('반복 session_create는 같은 idempotency key 아래 결정적 순서로 묶는다', () => {
    const batch = buildSessionCreateRequestBatch([
      { courseId: 10, sessionDate: '2026-08-03', startTime: '16:00' },
      { courseId: 10, sessionDate: '2026-08-10', startTime: '16:00' },
    ], 1, 'f957825a-f104-4827-9b2b-87f890ca6e9c');
    expect(batch.idempotencyKey).toBe('f957825a-f104-4827-9b2b-87f890ca6e9c');
    expect(batch.requests.map((request) => request.sessionDate))
      .toEqual(['2026-08-03', '2026-08-10']);
    expect(batch.requests.every((request) =>
      request.requestKind === 'session_create' && request.instructorId === 1)).toBe(true);
  });

  it('강사 승인 요청은 배정중 회차를 가짜 ID로 변환하지 않고 차단한다', () => {
    expect(() => buildSessionCreateRequestBody({
      courseId: 10,
      instructorId: null,
      sessionDate: '2026-08-03',
      startTime: '16:00',
    })).toThrow('담당 강사가 필요');
  });
});
