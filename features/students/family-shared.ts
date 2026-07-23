// [TBO-30G 2026-07-23 대표 지시] 가족 표시·판정의 **단일 진실원** — 관계 라벨·구성원 파생이
//  StudentFamilyRelationsSection(학생 상세·상담 상세 공용)과 상담 접수 힌트에 전부 이 모듈 하나로
//  공급된다(종전엔 화면마다 '형제·자매'/'기타' 라벨 사본 정의).
import type { StudentFamilyMember } from '@/lib/api';
import type { StudentFamilyRelation } from '@/types';
import { studentGradeLabel } from '@/lib/domain/students';

/** 관계 표기 — sibling은 고정 라벨, other는 사용자 지정 라벨(없으면 '기타'). */
export const familyRelationLabel = (
  relation: Pick<StudentFamilyRelation, 'relationType' | 'relationLabel'> | Pick<StudentFamilyMember, 'relationType' | 'relationLabel'>,
): string => (relation.relationType === 'sibling' ? '형제·자매' : relation.relationLabel?.trim() || '기타');

/** 구성원이 기준 학생과 보호자를 공유하는가(조인 파생 필드 소비). */
export const hasSharedGuardian = (member: Pick<StudentFamilyMember, 'sharedGuardianParentIds'>): boolean =>
  member.sharedGuardianParentIds.length > 0;

/** 가족 전체의 상담 카드 수 — 상담 접수 힌트·상세 요약 공용. */
export const familyCounselCount = (members: ReadonlyArray<Pick<StudentFamilyMember, 'counselForms'>>): number =>
  members.reduce((acc, member) => acc + member.counselForms.length, 0);

/** 구성원 한 줄 요약(이름 옆 보조 표기) — "학년 · 학교" 형식, 없는 값은 생략. */
export const familyMemberSub = (member: Pick<StudentFamilyMember, 'student'>): string =>
  [member.student.grade != null ? studentGradeLabel(member.student.grade) : null, member.student.schoolName]
    .filter(Boolean).join(' · ');
