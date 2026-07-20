// [핫픽스 2026-07-20 ②] 승인센터 모집단 단일 소스 검증 — 배지('/admin')·대시보드 할일·승인센터가
//  같은 카운트를 봐야 한다(가입 승인·프로필 변경 누락 결함 회귀 방지).
import { describe, expect, it } from 'vitest';
import { approvalCenterCounts } from './approvals';
import { buildTasks, navBadges } from './tasks';

const emptySlice = {
  currentRole: 'manager' as const,
  instructors: [], students: [], courses: [], classSessions: [], sessionReports: [], expenses: [],
  instructorPayouts: [], counselForms: [], enrollments: [], payments: [], attendance: [],
  scheduleRequests: [], pendingAccounts: [], profileChangeRequests: [], myProfileChangeRequests: [],
};

const pendingAccount = (id: number, emailVerified = true) => ({
  id, webId: `user${id}`, name: `대기${id}`, email: `u${id}@t.test`, role: 'instructor',
  status: 'pending', emailVerified, createdAt: '2026-07-20T00:00:00Z',
});

const profileChange = (id: number, status: 'pending' | 'rejected', rejectionReason?: string) => ({
  id, requesterId: 9, beforeValues: {}, requestedChanges: { name: '개명' }, reason: '표기 정비',
  baseProfileVersion: 1, status, rejectionReason,
  createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z',
});

describe('승인센터 모집단 통일 (핫픽스 07-20 ②③)', () => {
  it('가입 승인·프로필 변경이 총합·/admin 배지·할일 항목에 모두 반영된다', () => {
    const s = {
      ...emptySlice,
      pendingAccounts: [pendingAccount(1), pendingAccount(2, false)] as never[],
      profileChangeRequests: [profileChange(11, 'pending')] as never[],
    };
    const counts = approvalCenterCounts(s as never);
    expect(counts.signups).toBe(2);
    expect(counts.profileChanges).toBe(1);
    expect(counts.total).toBe(3);

    const badges = navBadges(s as never, 'manager');
    expect(badges['/admin']).toBe(3); // 종전 결함: 가입·프로필 변경 제외로 0이었다

    const { items } = buildTasks(s as never, 'manager');
    const accountItems = items.filter((t) => t.group === 'account');
    expect(accountItems).toHaveLength(3);
    expect(accountItems.every((t) => t.href === '/admin/approvals')).toBe(true);
    // 미인증 가입 대기는 재발송 안내가 detail에 노출된다
    expect(accountItems.find((t) => t.id === 'signup-approve-2')!.detail).toContain('미인증');
  });

  it('반려 사유 알림: 내 프로필 변경 반려가 사유와 함께 할일로 뜬다(전 역할)', () => {
    const s = {
      ...emptySlice,
      myProfileChangeRequests: [profileChange(21, 'rejected', '증빙 필요')] as never[],
    };
    const { items } = buildTasks(s as never, 'manager');
    const rejected = items.find((t) => t.id === 'my-profile-change-rejected-21');
    expect(rejected).toBeDefined();
    expect(rejected!.detail).toContain('증빙 필요');
    expect(rejected!.href).toBe('/account');
  });

  it('강사: 정산 반려·지급 회수가 사유와 함께 항목·/payouts 배지로 뜬다', () => {
    const s = {
      ...emptySlice,
      currentRole: 'instructor' as const,
      instructorPayouts: [
        { id: 31, instructorId: 1, periodStart: '2026-06-01', periodEnd: '2026-06-30', amount: 100000, status: 'rejected', rejectedReason: '기간 오류', sessionCount: 2, createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
        { id: 32, instructorId: 1, periodStart: '2026-05-01', periodEnd: '2026-05-31', amount: 50000, status: 'rejected', rejectedReason: '지급 착오', reversedAt: '2026-07-20T00:00:00Z', sessionCount: 1, createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
      ] as never[],
    };
    const { items } = buildTasks(s as never, 'instructor', 1);
    expect(items.find((t) => t.id === 'payout-rejected-31')!.title).toContain('정산 반려');
    expect(items.find((t) => t.id === 'payout-rejected-31')!.detail).toContain('기간 오류');
    expect(items.find((t) => t.id === 'payout-rejected-32')!.title).toContain('지급 회수');
    expect(navBadges(s as never, 'instructor', 1)['/payouts']).toBe(2);
  });
});
