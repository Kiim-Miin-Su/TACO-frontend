import { describe, expect, it } from "vitest";
import { DEV_ACCOUNTS, devAccountById, devAccountLabel } from "./dev-accounts";

describe("demo account identities", () => {
  it("keeps user ids and web ids unique", () => {
    expect(new Set(DEV_ACCOUNTS.map((account) => account.id)).size).toBe(DEV_ACCOUNTS.length);
    expect(new Set(DEV_ACCOUNTS.map((account) => account.webId)).size).toBe(DEV_ACCOUNTS.length);
  });

  it("labels every option with the exact user and role", () => {
    expect(devAccountLabel(devAccountById(3)!)).toBe("김민수 · 대표(CEO)");
    expect(devAccountLabel(devAccountById(1)!)).toBe("박지훈 · 강사");
  });

  it("offers both instructor users independently", () => {
    expect(DEV_ACCOUNTS.filter((account) => account.role === "instructor").map((account) => account.name)).toEqual([
      "박지훈",
      "정유진",
    ]);
  });
});
