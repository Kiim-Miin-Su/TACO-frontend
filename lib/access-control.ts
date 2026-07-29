import type { AccountRole } from "@/types";
import { roleHasCapability, type RoleCapability } from "@kms545487/contracts";

export type AppCapability = RoleCapability;

export type VerifiedAccount = { id: number; name: string; role: AccountRole };

const ROLE_PRIORITY: AccountRole[] = ["super_admin", "admin", "manager", "instructor"];

export function resolveBackofficeRole(roles: readonly string[]): AccountRole | null {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

export function hasCapability(role: AccountRole | null | undefined, capability: AppCapability): boolean {
  return role != null && roleHasCapability(role, capability);
}

export function accountScopeKey(account: Pick<VerifiedAccount, "id" | "role"> | null): string {
  return account ? `${account.id}:${account.role}` : "anon";
}

export function instructorIdFor(account: Pick<VerifiedAccount, "id" | "role"> | null): number | null {
  return account?.role === "instructor" ? account.id : null;
}

// [TBO-65 P2 FE-8 2026-07-26] super_admin 판정 단일 진실원 — 컴포넌트 리터럴 비교 5곳 수렴.
//  용도: 대표 전용 UI 어포던스(재무 액션·유저 관리 확장). 서버 인가는 항상 별도(@Roles)로 강제.
export const isSuperAdmin = (role: string | null | undefined): boolean => role === 'super_admin';
