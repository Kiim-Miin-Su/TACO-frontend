import type { AccountRole } from '@/types';
import { hasCapability } from '@/lib/access-control';

export const roleLabel: Record<AccountRole, string> = {
  student: '학생',
  parent: '학부모',
  instructor: '강사',
  manager: '매니저',
  admin: '관리자',
  super_admin: '대표(CEO)',
};

// 백오피스 로그인 역할 목록. 학생·학부모는 도메인 엔티티지만 로그인 주체가 아니다.
export const BACKOFFICE_ROLES: AccountRole[] = ['super_admin', 'admin', 'manager', 'instructor'];
export const ROLES: AccountRole[] = BACKOFFICE_ROLES;

// 호환 wrapper. 새 권한 판정은 access-control의 capability 이름을 직접 사용한다.
export const isAdmin = (r: AccountRole | null | undefined) => hasCapability(r, 'admin.area');
export const isCEO = (r: AccountRole | null | undefined) => r === 'super_admin';
export const canAccessFinance = (r: AccountRole | null | undefined) => hasCapability(r, 'finance.access');
export const isStudentOrParent = (r: AccountRole | null | undefined) => r === 'student' || r === 'parent';
