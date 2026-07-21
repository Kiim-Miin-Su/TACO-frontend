// ──────────────────────────────────────────────────────────────
// 학생 도메인 규칙 (순수 함수). UI·스토어와 분리해 백엔드 서비스와 1:1 매핑.
//
// 책임 분리 의도:
//  - 본 파일 = "무엇이 활성 학생인가 / 퇴원은 어떤 상태 전이인가" 라는 비즈니스 규칙.
//  - backend StudentsService/DB가 상태와 삭제의 권위이며 이 파일은 표시·필터 규칙만 담당한다.
// ──────────────────────────────────────────────────────────────
import type { Student, StudentStatus } from '@/types';

// 운영 목록·일정에서 제외되는 "비활성" 상태.
// 퇴원·등록이탈은 조회 가능한 업무 상태이며 soft delete와 별개다.
// 백엔드 매핑: `WHERE status NOT IN (...)`  (목록 조회 기본 스코프)
export const INACTIVE_STUDENT_STATUSES: readonly StudentStatus[] = ['withdrawn', 'registration_lost'];

export const isActiveStudent = (s: Student): boolean =>
  !INACTIVE_STUDENT_STATUSES.includes(s.status);

/** 학생 상태 라벨·배지 톤 — 단일 소스(함수 통일 2026-07-03: StudentsView·캘린더 유저 카드 중복 제거). */
export const STUDENT_STATUS_LABEL: Record<string, string> = {
  enrolled: '수강중', on_leave: '휴강', withdrawn: '퇴원', registration_lost: '등록이탈', new_inquiry: '신규접수',
};
export const STUDENT_STATUS_TONE: Record<string, 'accent' | 'success' | 'attention' | 'done' | 'danger'> = {
  enrolled: 'success', on_leave: 'attention', withdrawn: 'danger', registration_lost: 'done', new_inquiry: 'accent',
};

/** 학생의 활성 수강 코스명 — 통일 감사 2026-07-03: StudentsView·캘린더 유저 카드 중복 제거(단일 소스). */
export function activeCourseNamesOf(
  studentId: number,
  enrollments: { studentId: number | string; courseId: number | string; status?: string }[],
  courses: { id: number | string; name: string }[],
): string[] {
  return enrollments
    .filter((e) => Number(e.studentId) === studentId && (e.status ?? 'active') === 'active')
    .map((e) => courses.find((c) => Number(c.id) === Number(e.courseId))?.name ?? `코스 ${e.courseId}`);
}

/** 활성 학생만 반환 (퇴원/비활성 제외) — 모든 운영 화면의 기본 스코프 */
export const activeStudents = (list: Student[]): Student[] => list.filter(isActiveStudent);
