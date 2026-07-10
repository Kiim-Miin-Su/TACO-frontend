import type { AccountRole } from '@/types';

export const roleLabel: Record<AccountRole, string> = {
  student: '학생',
  parent: '학부모',
  instructor: '강사',
  manager: '매니저',
  admin: '관리자',
  super_admin: '대표(CEO)',
};

// 백오피스 로그인/역할 전환 노출 목록. 학생·학부모는 도메인 엔티티지만 로그인 주체가 아니다.
export const BACKOFFICE_ROLES: AccountRole[] = ['super_admin', 'admin', 'manager', 'instructor'];
export const ROLES: AccountRole[] = BACKOFFICE_ROLES;

export const isAdmin = (r: AccountRole) => r === 'super_admin' || r === 'manager' || r === 'admin';
export const isCEO = (r: AccountRole) => r === 'super_admin'; // 경영 지표(총액·추이) 열람
export const canAccessFinance = (r: AccountRole) => r === 'super_admin';
export const isStudentOrParent = (r: AccountRole) => r === 'student' || r === 'parent';
