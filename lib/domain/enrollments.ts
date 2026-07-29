// [TBO-34 C3 2026-07-23] 수강 상태 표기의 **단일 진실원** — 종전 3곳(StudentDetailView·
//  CourseDetailView·DashboardView)이 같은 맵을 사본으로 정의. lib/domain/students.ts의
//  STUDENT_STATUS_* 규약과 동형.
import type { Tone } from '@/components/ui';
import type { EnrollmentStatus } from '@/types';
import type { RoadmapAggregate } from '@/lib/api';

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: '수강중', paused: '일시정지', completed: '수료', canceled: '취소',
};

export const ENROLLMENT_STATUS_TONE: Record<EnrollmentStatus, Tone> = {
  active: 'success', paused: 'attention', completed: 'done', canceled: 'danger',
};

/** 수강 생성에서 선택 가능한 로드맵. 활성 원부 + 선택 코스 포함은 서버 명령과 같은 규약이다. */
export function eligibleRoadmapsForCourse(
  roadmaps: RoadmapAggregate[],
  courseId: number | null,
): RoadmapAggregate[] {
  if (courseId == null) return [];
  return roadmaps.filter(
    (roadmap) => roadmap.isActive && roadmap.courses.some((course) => course.courseId === courseId),
  );
}
