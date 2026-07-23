// [TBO-47 2026-07-23] 로드맵 화면 표시 파생의 **단일 진실원** — 목록·상세가 같은 함수를 소비한다.
//  학년 라벨은 lib/domain/students.studentGradeLabel 재사용(사본 금지 — 대표 상시 규약).
import { studentGradeLabel } from './students';
import type { RoadmapAggregate } from '@/lib/api';

/** 대상 학년 라벨 — 'Kinder' | 'G11' | '전체'(미지정). */
export const roadmapTargetLabel = (targetGrade: number | null | undefined): string =>
  targetGrade == null ? '전체' : studentGradeLabel(targetGrade);

/** 기간 라벨 — '12주' | '—'(미지정). */
export const roadmapDurationLabel = (durationWeeks: number | null | undefined): string =>
  durationWeeks == null ? '—' : `${durationWeeks}주`;

/** 코스 순서 라벨 — 'SAT Reading 정규 → TOEFL 정규'(sortOrder 정렬은 서버 파생을 신뢰). */
export const roadmapSequenceLabel = (courses: RoadmapAggregate['courses']): string =>
  courses.length ? courses.map((course) => course.courseName).join(' → ') : '연결된 코스 없음';
