// [TBO-47 2026-07-23] 로드맵 표시 파생 SSOT — 목록·상세가 소비하는 라벨 함수 계약 고정.
import { describe, expect, it } from 'vitest';
import { roadmapDurationLabel, roadmapSequenceLabel, roadmapTargetLabel } from './roadmaps';

const course = (courseName: string, sortOrder: number) =>
  ({ linkId: sortOrder + 1, courseId: sortOrder + 10, sortOrder, courseName, subjectId: 1 });

describe('roadmap display derivations (SSOT)', () => {
  it('대상 학년 — studentGradeLabel 재사용(Kinder=0·G표기), 미지정은 전체', () => {
    expect(roadmapTargetLabel(0)).toBe('Kinder');
    expect(roadmapTargetLabel(11)).toBe('G11');
    expect(roadmapTargetLabel(null)).toBe('전체');
    expect(roadmapTargetLabel(undefined)).toBe('전체');
  });

  it('기간 — N주 표기, 미지정은 —', () => {
    expect(roadmapDurationLabel(12)).toBe('12주');
    expect(roadmapDurationLabel(null)).toBe('—');
  });

  it('코스 순서 — courseName을 → 로 연결(서버 sortOrder 정렬 신뢰), 빈 목록 문구', () => {
    expect(roadmapSequenceLabel([course('SAT Reading 정규', 0), course('TOEFL 정규', 1)]))
      .toBe('SAT Reading 정규 → TOEFL 정규');
    expect(roadmapSequenceLabel([])).toBe('연결된 코스 없음');
  });
});
