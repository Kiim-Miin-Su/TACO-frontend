// [TBO-58 P2 2026-07-24] enrollments 도메인 모듈 테스트 — 유일한 무테스트 도메인 모듈이었다(검증③).
//  계약: 상태 라벨·톤 맵이 EnrollmentStatus 전 값을 덮는다(단일 진실원 — 사본 3곳 제거의 회귀 방지).
import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_TONE,
  eligibleRoadmapsForCourse,
} from '@/lib/domain/enrollments';
import type { EnrollmentStatus } from '@/types';
import type { RoadmapAggregate } from '@/lib/api';

const ALL_STATUSES: EnrollmentStatus[] = ['active', 'paused', 'completed', 'canceled'];

describe('domain/enrollments', () => {
  it('상태 라벨 — 전 상태 커버, 한국어 표기 고정(드리프트 차단)', () => {
    expect(Object.keys(ENROLLMENT_STATUS_LABEL).sort()).toEqual([...ALL_STATUSES].sort());
    expect(ENROLLMENT_STATUS_LABEL.active).toBe('수강중');
    expect(ENROLLMENT_STATUS_LABEL.paused).toBe('일시정지');
    expect(ENROLLMENT_STATUS_LABEL.completed).toBe('수료');
    expect(ENROLLMENT_STATUS_LABEL.canceled).toBe('취소');
  });

  it('상태 톤 — 전 상태 커버, 의미 정합(진행=success·중지=attention·취소=danger)', () => {
    expect(Object.keys(ENROLLMENT_STATUS_TONE).sort()).toEqual([...ALL_STATUSES].sort());
    expect(ENROLLMENT_STATUS_TONE.active).toBe('success');
    expect(ENROLLMENT_STATUS_TONE.paused).toBe('attention');
    expect(ENROLLMENT_STATUS_TONE.completed).toBe('done');
    expect(ENROLLMENT_STATUS_TONE.canceled).toBe('danger');
  });

  it('수강 로드맵 선택 — 활성 원부 중 선택 코스를 포함한 항목만 허용한다', () => {
    const roadmap = (
      id: number,
      isActive: boolean,
      courseIds: number[],
    ): RoadmapAggregate => ({
      id,
      title: `로드맵 ${id}`,
      isActive,
      courses: courseIds.map((courseId, sortOrder) => ({
        linkId: id * 10 + sortOrder,
        courseId,
        sortOrder,
        courseName: `코스 ${courseId}`,
        subjectId: 1,
      })),
    } as RoadmapAggregate);
    const rows = [
      roadmap(1, true, [10, 11]),
      roadmap(2, false, [10]),
      roadmap(3, true, [12]),
    ];

    expect(eligibleRoadmapsForCourse(rows, 10).map((row) => row.id)).toEqual([1]);
    expect(eligibleRoadmapsForCourse(rows, 12).map((row) => row.id)).toEqual([3]);
    expect(eligibleRoadmapsForCourse(rows, null)).toEqual([]);
  });
});
