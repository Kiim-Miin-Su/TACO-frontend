import type { AccountRole } from "@/types";
import { roleHasCapability, type RoleCapability } from "@kms545487/contracts";

export type AppCapability = RoleCapability;

export type VerifiedAccount = {
  id: number;
  name: string;
  role: AccountRole;
  accessVersion: number;
  effectiveCapabilities: readonly RoleCapability[];
};

const ROLE_PRIORITY: AccountRole[] = ["super_admin", "admin", "manager", "instructor"];

export function resolveBackofficeRole(roles: readonly string[]): AccountRole | null {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

export function hasCapability(role: AccountRole | null | undefined, capability: AppCapability): boolean {
  return role != null && roleHasCapability(role, capability);
}

export function accountHasCapability(
  account: Pick<VerifiedAccount, "effectiveCapabilities"> | null | undefined,
  capability: AppCapability,
): boolean {
  return account?.effectiveCapabilities.includes(capability) === true;
}

export function accountScopeKey(account: Pick<VerifiedAccount, "id" | "role" | "accessVersion"> | null): string {
  return account ? `${account.id}:${account.role}:v${account.accessVersion}` : "anon";
}

// [TBO-87] 겸직(강사+매니저) — 강사 정체성은 role 단독이 아니라 instructor.self capability가 권위다.
//  BE가 활성 강사원부를 보유한 manager/admin에 roles=['role','instructor']를 합성해 effective에
//  instructor.self가 포함된다. 겸직 매니저도 본인 세션 어포던스(인라인 리포트·내 출석 스코프)에서
//  instructorId=본인 id를 얻는다. 제한(순수 강사 스코프 강제)은 이 값이 아니라 role/관리 capability로 판정.
export function instructorIdFor(
  account: (Pick<VerifiedAccount, "id" | "role"> & Partial<Pick<VerifiedAccount, "effectiveCapabilities">>) | null,
): number | null {
  if (!account) return null;
  const teaching = account.role === "instructor" || account.effectiveCapabilities?.includes("instructor.self") === true;
  return teaching ? account.id : null;
}

// [TBO-65 P2 FE-8 2026-07-26] super_admin 판정 단일 진실원 — 컴포넌트 리터럴 비교 5곳 수렴.
//  용도: 대표 전용 UI 어포던스(재무 액션·유저 관리 확장). 서버 인가는 항상 별도(@Roles)로 강제.
export const isSuperAdmin = (role: string | null | undefined): boolean => role === 'super_admin';
