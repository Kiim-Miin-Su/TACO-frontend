import type { AccountRole } from '@/types';

export const roleLabel: Record<AccountRole, string> = {
  student: '학생',
  parent: '학부모',
  instructor: '강사',
  manager: '매니저',
  admin: '관리자',
  super_admin: '대표(CEO)',
};

// 계정 역할 목록(화면 권한/라벨 계산용)
export const ROLES: AccountRole[] = ['super_admin', 'manager', 'instructor', 'student', 'parent'];

export const isAdmin = (r: AccountRole) => r === 'super_admin' || r === 'manager' || r === 'admin';
export const isCEO = (r: AccountRole) => r === 'super_admin'; // 경영 지표(총액·추이) 열람
export const canAccessFinance = (r: AccountRole) => r === 'super_admin';
export const isStudentOrParent = (r: AccountRole) => r === 'student' || r === 'parent';
