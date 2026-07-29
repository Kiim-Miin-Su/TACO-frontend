import { describe, expect, it } from 'vitest';
import { counselSnapshotInput, counselSnapshotRevision, snapshotFromForm } from '@/features/counsel/snapshot';

describe('snapshotFromForm', () => {
  it('차수 이력에 필요한 전체 상담 페이지를 nullable 값까지 고정한다', () => {
    const snapshot = snapshotFromForm({
      id: 9,
      studentId: 17,
      status: 'pending',
      source: 'manual',
      submitterType: 'parent',
      createdAt: '2026-07-21',
    });
    expect(snapshot).toMatchObject({
      studentId: 17, status: 'pending', source: 'manual', submitterType: 'parent', nextContactAt: null,
    });
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('createdAt');
  });

  it('회차 command에는 서버 소유 작성 메타데이터를 포함하지 않는다', () => {
    const input = counselSnapshotInput({
      studentId: 17,
      assignedStaffId: 3,
      status: 'pending',
      source: 'manual',
      submitterType: 'staff',
      referenceNotes: '상담 내용',
      nextContactAt: '2026-07-21T00:30:00.000Z',
    });

    expect(input).toEqual({
      studentId: 17,
      status: 'pending',
      referenceNotes: '상담 내용',
      nextContactAt: '2026-07-21T00:30:00.000Z',
    });
    expect(input).not.toHaveProperty('assignedStaffId');
    expect(input).not.toHaveProperty('source');
    expect(input).not.toHaveProperty('submitterType');
  });

  it('다음 회차 초안 key는 편집 가능한 snapshot 값이 바뀌면 갱신된다', () => {
    const base = {
      studentId: 17,
      assignedStaffId: 3,
      status: 'pending' as const,
      source: 'manual' as const,
      submitterType: 'staff' as const,
      referenceNotes: '상담 내용',
      nextContactAt: '2026-07-21T00:30:00.000Z',
    };
    expect(counselSnapshotRevision(base))
      .not.toBe(counselSnapshotRevision({ ...base, nextContactAt: '2026-07-22T00:30:00.000Z' }));
    expect(counselSnapshotRevision(base))
      .not.toBe(counselSnapshotRevision({ ...base, referenceNotes: '수정된 상담 내용' }));
  });
});
