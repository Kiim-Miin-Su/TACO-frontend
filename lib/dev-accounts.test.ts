import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNT_DEFS, DEMO_SWITCHER_ENABLED, DEV_ACCOUNTS, devAccountLabel } from "./dev-accounts";

// [TBO-28B] DEV_ACCOUNTS는 NEXT_PUBLIC_ENABLE_DEMO_ACCOUNT_SWITCHER=true에서만 채워진다
//  (vitest 기본 env는 미설정=off — production과 동일 경로). 계정 정의 자체는 DEMO_ACCOUNT_DEFS로 검증.
describe("demo account identities", () => {
  it("gates the runtime list behind the demo switcher flag (off => empty)", () => {
    if (DEMO_SWITCHER_ENABLED) expect(DEV_ACCOUNTS).toHaveLength(DEMO_ACCOUNT_DEFS.length);
    else expect(DEV_ACCOUNTS).toHaveLength(0);
  });

  it("keeps user ids and web ids unique", () => {
    expect(new Set(DEMO_ACCOUNT_DEFS.map((account) => account.id)).size).toBe(DEMO_ACCOUNT_DEFS.length);
    expect(new Set(DEMO_ACCOUNT_DEFS.map((account) => account.webId)).size).toBe(DEMO_ACCOUNT_DEFS.length);
  });

  it("labels every option with the exact user and role", () => {
    const admin = DEMO_ACCOUNT_DEFS.find((account) => account.id === 3)!;
    const inst = DEMO_ACCOUNT_DEFS.find((account) => account.id === 1)!;
    expect(devAccountLabel(admin)).toBe("김민수 · 대표(CEO)");
    expect(devAccountLabel(inst)).toBe("박지훈 · 강사");
  });

  it("offers both instructor users independently", () => {
    expect(DEMO_ACCOUNT_DEFS.filter((account) => account.role === "instructor").map((account) => account.name)).toEqual([
      "박지훈",
      "정유진",
    ]);
  });
});
