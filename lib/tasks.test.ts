import { describe, expect, it } from 'vitest';
import { buildTasks, navBadges } from './tasks';
import type { ScheduleRequest } from '@kms545487/contracts';

// TBO-16 R1 — 수업 요청이 배지·To-do의 "같은 모집단"으로 집계되는지(승인센터 리스트=pending과 동일 기준).
//  buildTasks(Topbar 알림·대시보드 To-do)와 navBadges(사이드바 탭)가 동일 scheduleRequests 슬라이스를 소비한다.

const req = (over: Partial<ScheduleRequest>): ScheduleRequest => ({
  id: 1, requesterId: 1, courseId: 10, instructorId: 1,
  sessionDate: '2099-01-04', startTime: '09:00', durationMinutes: 60, status: 'pending',
  ...over,
});

// 최소 슬라이스 — 다른 도메인은 빈 배열(요청 항목만 분리 검증)
const emptySlice = {
  currentRole: 'manager' as const,
  instructors: [{ id: 1, name: '박지훈' }],
  students: [], courses: [], classSessions: [], sessionReports: [], expenses: [],
  instructorPayouts: [], counselForms: [], enrollments: [], payments: [], attendance: [],
  scheduleRequests: [] as ScheduleRequest[],
};

describe('scheduleRequests — 배지·To-do 동일 모집단(R1)', () => {
  it('관리자: pending 요청 = To-do 카운트 + /admin 배지 (승인센터 리스트와 같은 기준)', () => {
    const s = { ...emptySlice, scheduleRequests: [req({ id: 1 }), req({ id: 2 }), req({ id: 3, status: 'approved' })] };
    const { items, count } = buildTasks(s, 'manager');
    const requestItems = items.filter((t) => t.group === 'schedule');
    expect(requestItems).toHaveLength(2); // pending 2건만(approved 제외)
    expect(requestItems.every((t) => t.counts && t.href === '/admin/approvals')).toBe(true);
    expect(count).toBe(2);
    expect(navBadges(s, 'manager')['/admin']).toBe(2); // 탭 배지 = 같은 pending 모집단
  });

  it('관리자: pending 0이면 /admin 배지 키 없음(0 미표기 규약)', () => {
    const s = { ...emptySlice, scheduleRequests: [req({ id: 1, status: 'rejected', reason: 'x' })] };
    expect(navBadges(s, 'manager')['/admin']).toBeUndefined();
  });

  it('강사: 반려=카운트(조치 필요·사유 표기), 대기=정보성(counts=false), 승인 링크 없음', () => {
    const s = {
      ...emptySlice, currentRole: 'instructor' as const,
      scheduleRequests: [req({ id: 1, status: 'rejected', reason: '강의실 부족' }), req({ id: 2, status: 'pending' })],
    };
    const { items } = buildTasks(s, 'instructor', 1);
    const rejected = items.find((t) => t.id === 'my-request-1');
    const pending = items.find((t) => t.id === 'my-request-2');
    expect(rejected?.counts).toBe(true);
    expect(rejected?.detail).toContain('강의실 부족'); // 반려 사유 노출(Q2 — 사유 필수의 소비처)
    expect(pending?.counts).toBe(false);
    expect(items.every((t) => t.href !== '/admin/approvals')).toBe(true); // 강사는 승인센터 미유도
    expect(navBadges(s, 'instructor', 1)['/calendar']).toBe(1); // 반려 1건 = 캘린더 탭 배지
  });

  it('강사 식별자가 없으면 데모 강사로 폴백하지 않는다', () => {
    const s = { ...emptySlice, currentRole: 'instructor' as const, scheduleRequests: [req({ id: 1, status: 'rejected' })] };
    expect(buildTasks(s, 'instructor').items).toEqual([]);
    expect(navBadges(s, 'instructor')).toEqual({});
  });

  it('역할 격리: 같은 데이터라도 학생/학부모 역할은 항목 0(권한 반영)', () => {
    const s = { ...emptySlice, scheduleRequests: [req({ id: 1 })] };
    expect(buildTasks(s, 'student' as never).items).toHaveLength(0);
    expect(navBadges(s, 'student' as never)).toEqual({});
  });
});
