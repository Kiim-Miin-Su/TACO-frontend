import { describe, expect, it } from "vitest";

describe("retired client account switcher", () => {
  it("does not expose a runtime account list", async () => {
    expect(Object.keys(await import("./dev-accounts"))).toEqual([]);
  });
});
