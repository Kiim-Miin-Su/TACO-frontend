// [TBO-58 P2 2026-07-24] roles 호환 wrapper 테스트 — 신 권한 판정(access-control capability)과의
//  정합이 계약: isAdmin=admin.area, canAccessFinance=finance.access(대표 전용). 라벨 전수 존재도 고정
//  (누락 시 화면에 undefined 노출되는 회귀 차단 — 검증③ FE 유틸 무테스트 갭).
import { describe, expect, it } from 'vitest';
import { roleLabel, isAdmin, canAccessFinance } from '@/lib/roles';
import type { AccountRole } from '@/types';

const ALL_ROLES: AccountRole[] = ['student', 'parent', 'instructor', 'manager', 'admin', 'super_admin'];

describe('roles', () => {
  it('roleLabel — 전 역할 라벨 존재(비어있지 않은 한국어 표기)', () => {
    for (const role of ALL_ROLES) {
      expect(typeof roleLabel[role]).toBe('string');
      expect(roleLabel[role].length).toBeGreaterThan(0);
    }
    expect(roleLabel.super_admin).toContain('대표'); // 대표 표기 고정(화면 전반 사용)
  });

  it('isAdmin — 매니저 이상 true, 강사·학생·학부모·미로그인 false', () => {
    expect(isAdmin('super_admin')).toBe(true);
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('manager')).toBe(true);
    expect(isAdmin('instructor')).toBe(false);
    expect(isAdmin('student')).toBe(false);
    expect(isAdmin('parent')).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('canAccessFinance — 대표(super_admin) 전용(TBO-21 RBAC 정합)', () => {
    expect(canAccessFinance('super_admin')).toBe(true);
    for (const role of ALL_ROLES.filter((r) => r !== 'super_admin')) {
      expect(canAccessFinance(role)).toBe(false);
    }
    expect(canAccessFinance(null)).toBe(false);
  });
});
