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

// 호환 wrapper. 새 권한 판정은 access-control의 capability 이름을 직접 사용한다.
export const isAdmin = (r: AccountRole | null | undefined) => hasCapability(r, 'admin.area');
export const canAccessFinance = (r: AccountRole | null | undefined) => hasCapability(r, 'finance.access');
