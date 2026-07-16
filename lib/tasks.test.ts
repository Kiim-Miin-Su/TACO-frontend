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

// [대표 지시 ⑭ 2026-07-16] 보강 미배정 — 매니저 To-do·/calendar 배지(강사와 같은 lib/makeup 단일 정의).
describe('보강 미배정 — 매니저 배지·To-do', () => {
  const canceled = { id: 21, courseId: 10, instructorId: 1, sessionDate: '2026-01-05', startTime: '16:00', durationMinutes: 60, status: 'canceled' as const };
  const makeup = { id: 22, courseId: 10, instructorId: 1, sessionDate: '2026-01-08', startTime: '16:00', durationMinutes: 60, status: 'makeup' as const, makeupForSessionId: 21 };

  it('결강(취소)인데 보강 미연결 → 매니저 To-do(보강 미배정)+/calendar 배지', () => {
    const s = { ...emptySlice, classSessions: [canceled] };
    const { items } = buildTasks(s, 'manager');
    const item = items.find((t) => t.id === 'makeup-21');
    expect(item?.counts).toBe(true);
    expect(item?.title).toContain('보강 미배정');
    expect(item?.detail).toContain('취소됨');
    expect(navBadges(s, 'manager')['/calendar']).toBe(1);
  });

  it('보강 세션이 원본을 가리키면(makeupForSessionId) 해소 — 배지·To-do에서 제외', () => {
    const s = { ...emptySlice, classSessions: [canceled, makeup] };
    expect(buildTasks(s, 'manager').items.find((t) => t.id === 'makeup-21')).toBeUndefined();
    expect(navBadges(s, 'manager')['/calendar']).toBeUndefined();
  });
});

// [B3 2026-07-16 대표 결정 ①] 열람(last-seen) 게이트 — 탭 진입 후 뱃지 숨김, 새 활동엔 재표시.
describe('알림 뱃지 읽음(last-seen) 게이트', () => {
  const canceled = { id: 31, courseId: 10, instructorId: 1, sessionDate: '2026-01-05', startTime: '16:00', durationMinutes: 60, status: 'canceled' as const, updatedAt: '2026-07-16T10:00:00.000Z' };

  it('열람 시각 ≥ 마지막 활동이면 뱃지 숨김, 이후 새 활동(updatedAt 전진)이면 재표시', () => {
    const s = { ...emptySlice, classSessions: [canceled] };
    expect(navBadges(s, 'manager')['/calendar']).toBe(1); // 미열람 — 표시
    const seenAfter = { calendar: '2026-07-16T11:00:00.000Z' }; // 활동 이후 열람
    expect(navBadges(s, 'manager', undefined, seenAfter)['/calendar']).toBeUndefined();
    // 새 활동(더 늦은 updatedAt의 결강) → 다시 표시
    const newer = { ...canceled, id: 32, updatedAt: '2026-07-16T12:00:00.000Z' };
    const s2 = { ...emptySlice, classSessions: [canceled, newer] };
    expect(navBadges(s2, 'manager', undefined, seenAfter)['/calendar']).toBe(2);
  });

  it('열람 시각이 활동보다 이르면 계속 표시(놓친 알림 보존)', () => {
    const s = { ...emptySlice, classSessions: [canceled] };
    const seenBefore = { calendar: '2026-07-16T09:00:00.000Z' };
    expect(navBadges(s, 'manager', undefined, seenBefore)['/calendar']).toBe(1);
  });
});
