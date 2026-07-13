import { roleLabel } from "@/lib/roles";
import type { AccountRole } from "@/types";

export type BackofficeAccountRole = Exclude<AccountRole, "student" | "parent">;

export type DevAccount = {
  id: number;
  webId: string;
  name: string;
  role: BackofficeAccountRole;
  password: string;
};

// Login and account switcher share this list; ids and credentials mirror backend demo seeds.
export const DEV_ACCOUNTS = [
  { id: 3, webId: "admin", name: "김민수", role: "super_admin", password: "demo1234" },
  { id: 5, webId: "prof_admin", name: "한서윤", role: "admin", password: "demo1234" },
  { id: 4, webId: "manager", name: "이지원", role: "manager", password: "demo1234" },
  { id: 1, webId: "park_inst", name: "박지훈", role: "instructor", password: "demo1234" },
  { id: 2, webId: "jung_inst", name: "정유진", role: "instructor", password: "demo1234" },
] as const satisfies readonly DevAccount[];

export function devAccountById(id: number | string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((account) => account.id === Number(id));
}

export function devAccountLabel(account: Pick<DevAccount, "name" | "role">): string {
  return `${account.name} · ${roleLabel[account.role]}`;
}
