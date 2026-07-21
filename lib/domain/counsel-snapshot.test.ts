import { describe, expect, it } from 'vitest';
import { snapshotFromForm } from '@/features/counsel/snapshot';

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
});
