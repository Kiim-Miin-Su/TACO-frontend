// [TBO-30G 2026-07-23] family-shared(가족 표시·판정 단일 진실원) 단위 검증 —
//  학생 상세·상담 상세·상담 접수가 소비하는 파생 규칙을 한곳에서 증명.
import { describe, expect, it } from 'vitest';
import {
  familyCounselCount, familyMemberSub, familyRelationLabel, hasSharedGuardian,
} from '@/features/students/family-shared';

describe('family-shared — 관계 라벨', () => {
  it('sibling은 고정 라벨, other는 지정 라벨(없으면 기타)', () => {
    expect(familyRelationLabel({ relationType: 'sibling', relationLabel: null })).toBe('형제·자매');
    expect(familyRelationLabel({ relationType: 'sibling', relationLabel: '무시됨' })).toBe('형제·자매');
    expect(familyRelationLabel({ relationType: 'other', relationLabel: '사촌' })).toBe('사촌');
    expect(familyRelationLabel({ relationType: 'other', relationLabel: '  ' })).toBe('기타');
    expect(familyRelationLabel({ relationType: 'other', relationLabel: null })).toBe('기타');
  });
});

describe('family-shared — 조인 파생', () => {
  it('보호자 공유 판정 — sharedGuardianParentIds 비었으면 false', () => {
    expect(hasSharedGuardian({ sharedGuardianParentIds: [3] })).toBe(true);
    expect(hasSharedGuardian({ sharedGuardianParentIds: [] })).toBe(false);
  });

  it('가족 상담 수 합산', () => {
    expect(familyCounselCount([
      { counselForms: [{ id: 1 }, { id: 2 }] as never },
      { counselForms: [] as never },
      { counselForms: [{ id: 3 }] as never },
    ])).toBe(3);
  });

  it('구성원 요약 — 학년·학교, 없는 값은 생략', () => {
    const student = (over: Record<string, unknown>) => ({ student: { grade: undefined, schoolName: undefined, ...over } } as never);
    expect(familyMemberSub(student({ grade: 8, schoolName: 'TACO School' }))).toBe('G8 · TACO School');
    expect(familyMemberSub(student({ grade: 0, schoolName: '유치원' }))).toBe('Kinder · 유치원');
    expect(familyMemberSub(student({ schoolName: 'TACO School' }))).toBe('TACO School');
    expect(familyMemberSub(student({}))).toBe('');
  });
});
