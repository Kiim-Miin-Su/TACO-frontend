'use client';

import { roleLabel } from '@/lib/roles';
import type { AppCapability } from '@/lib/access-control';
import { useAccountAccess } from '@/lib/useAccountAccess';

type ManagementGuardProps = {
  children: React.ReactNode;
  featureLabel: string;
  capability: AppCapability;
};

/** manager/admin/super_admin capability 화면의 공용 frontend rendering guard. */
export function ManagementGuard({ children, featureLabel, capability }: ManagementGuardProps) {
  const { role, can } = useAccountAccess();
  if (!can(capability)) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <div className="card card-pad text-section text-fg-muted">
          {featureLabel}은 관리 역할 전용 화면입니다. 현재 역할: <b>{role ? roleLabel[role] : '확인되지 않음'}</b>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
