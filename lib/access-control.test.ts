import { describe, expect, it } from "vitest";
import { accountScopeKey, hasCapability, instructorIdFor, resolveBackofficeRole } from "@/lib/access-control";

describe("access-control", () => {
  it("resolves only supported backoffice roles with deterministic priority", () => {
    expect(resolveBackofficeRole(["instructor", "manager"])).toBe("manager");
    expect(resolveBackofficeRole(["student", "parent"])).toBeNull();
  });

  it("keeps finance CEO-only and allows admin roles to enter scoped signup decisions", () => {
    expect(hasCapability("super_admin", "finance.access")).toBe(true);
    expect(hasCapability("super_admin", "signup.decide")).toBe(true);
    expect(hasCapability("admin", "finance.access")).toBe(false);
    expect(hasCapability("admin", "signup.decide")).toBe(true);
    expect(hasCapability("manager", "signup.decide")).toBe(true);
  });

  it("allows managers to manage calendars while instructors remain self-scoped", () => {
    expect(hasCapability("manager", "calendar.manage")).toBe(true);
    expect(hasCapability("instructor", "calendar.manage")).toBe(false);
    expect(hasCapability("instructor", "calendar.request-own")).toBe(true);
  });

  it("fails closed before an authoritative account exists", () => {
    expect(hasCapability(null, "admin.area")).toBe(false);
    expect(accountScopeKey(null)).toBe("anon");
    expect(instructorIdFor(null)).toBeNull();
  });

  it("builds cache scope and instructor identity from the same verified account", () => {
    const account = { id: 42, role: "instructor" as const };
    expect(accountScopeKey(account)).toBe("42:instructor");
    expect(instructorIdFor(account)).toBe(42);
    expect(instructorIdFor({ id: 42, role: "manager" })).toBeNull();
  });
});
