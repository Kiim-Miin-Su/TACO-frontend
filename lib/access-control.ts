import type { AccountRole } from "@/types";

export type AppCapability =
  | "admin.area"
  | "approval.manage"
  | "signup.decide"
  | "finance.access"
  | "calendar.manage"
  | "calendar.request-own"
  | "instructor.self";

export type VerifiedAccount = { id: number; name: string; role: AccountRole };

const ROLE_PRIORITY: AccountRole[] = ["super_admin", "admin", "manager", "instructor"];

const ROLE_CAPABILITIES: Record<AccountRole, ReadonlySet<AppCapability>> = {
  super_admin: new Set([
    "admin.area", "approval.manage", "signup.decide", "finance.access",
    "calendar.manage", "calendar.request-own",
  ]),
  admin: new Set(["admin.area", "approval.manage", "calendar.manage", "calendar.request-own"]),
  manager: new Set(["admin.area", "approval.manage", "calendar.manage", "calendar.request-own"]),
  instructor: new Set(["calendar.request-own", "instructor.self"]),
  // 학생과 학부모는 도메인 역할 호환값일 뿐 백오피스 로그인 역할이 아니다.
  student: new Set(),
  parent: new Set(),
};

export function resolveBackofficeRole(roles: readonly string[]): AccountRole | null {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

export function hasCapability(role: AccountRole | null | undefined, capability: AppCapability): boolean {
  return role != null && ROLE_CAPABILITIES[role].has(capability);
}

export function accountScopeKey(account: Pick<VerifiedAccount, "id" | "role"> | null): string {
  return account ? `${account.id}:${account.role}` : "anon";
}

export function instructorIdFor(account: Pick<VerifiedAccount, "id" | "role"> | null): number | null {
  return account?.role === "instructor" ? account.id : null;
}
