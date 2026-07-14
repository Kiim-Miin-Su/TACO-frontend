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

// [TBO-28B] 데모 전환기 빌드 플래그 — production 번들에서 데모 계정·비밀번호 문자열을 제거한다.
//  Next.js가 NEXT_PUBLIC_*를 빌드 타임 상수로 인라인 → false면 아래 계정 배열이 데드코드로 제거됨.
//  로컬 개발은 .env.local에서 true(기본 예시는 .env.example). production(Vercel)은 미설정=false.
export const DEMO_SWITCHER_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNT_SWITCHER === "true";

// Login and account switcher share this list; ids and credentials mirror backend demo seeds.
// ⚠ 앱 코드는 반드시 DEV_ACCOUNTS(플래그 게이트)를 import할 것 — DEMO_ACCOUNT_DEFS 직접 참조 금지
//   (테스트 전용 export — 앱에서 참조하면 production 번들에서 tree-shaking되지 않는다).
export const DEMO_ACCOUNT_DEFS = [
  { id: 3, webId: "admin", name: "김민수", role: "super_admin", password: "demo1234" },
  { id: 5, webId: "prof_admin", name: "한서윤", role: "admin", password: "demo1234" },
  { id: 4, webId: "manager", name: "이지원", role: "manager", password: "demo1234" },
  { id: 1, webId: "park_inst", name: "박지훈", role: "instructor", password: "demo1234" },
  { id: 2, webId: "jung_inst", name: "정유진", role: "instructor", password: "demo1234" },
] as const satisfies readonly DevAccount[];

export const DEV_ACCOUNTS: readonly DevAccount[] = DEMO_SWITCHER_ENABLED ? DEMO_ACCOUNT_DEFS : [];

export function devAccountById(id: number | string): DevAccount | undefined {
  return DEV_ACCOUNTS.find((account) => account.id === Number(id));
}

export function devAccountLabel(account: Pick<DevAccount, "name" | "role">): string {
  return `${account.name} · ${roleLabel[account.role]}`;
}
