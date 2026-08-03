import { describe, expect, it } from "vitest";
import { accountHasCapability, accountScopeKey, hasCapability, instructorIdFor, resolveBackofficeRole } from "@/lib/access-control";

describe("access-control", () => {
  it("resolves only supported backoffice roles with deterministic priority", () => {
    expect(resolveBackofficeRole(["instructor", "manager"])).toBe("manager");
    expect(resolveBackofficeRole(["student", "parent"])).toBeNull();
  });

  it("keeps finance CEO-only and allows admin roles to enter scoped signup decisions", () => {
    expect(hasCapability("super_admin", "executive.manage")).toBe(true);
    expect(hasCapability("admin", "executive.manage")).toBe(false);
    expect(hasCapability("super_admin", "finance.access")).toBe(true);
    expect(hasCapability("super_admin", "signup.decide")).toBe(true);
    expect(hasCapability("admin", "finance.access")).toBe(false);
    expect(hasCapability("admin", "signup.decide")).toBe(true);
    expect(hasCapability("manager", "signup.decide")).toBe(true);
    expect(hasCapability("admin", "payout.readiness")).toBe(true);
    expect(hasCapability("manager", "payout.readiness")).toBe(true);
    expect(hasCapability("instructor", "payout.readiness")).toBe(false);
  });

  it("allows managers to manage calendars while instructors remain self-scoped", () => {
    expect(hasCapability("manager", "calendar.manage")).toBe(true);
    expect(hasCapability("instructor", "calendar.manage")).toBe(false);
    expect(hasCapability("instructor", "calendar.request-own")).toBe(true);
    expect(hasCapability("manager", "counsel.manage")).toBe(true);
    expect(hasCapability("instructor", "counsel.manage")).toBe(false);
  });

  it("keeps student registry deletion out of the manager surface", () => {
    expect(hasCapability("super_admin", "student.hard-delete")).toBe(true);
    expect(hasCapability("admin", "student.hard-delete")).toBe(true);
    expect(hasCapability("manager", "student.hard-delete")).toBe(false);
    expect(hasCapability("instructor", "student.hard-delete")).toBe(false);
  });

  it("keeps authentication security history CEO/admin-only", () => {
    expect(hasCapability("super_admin", "security.events.read")).toBe(true);
    expect(hasCapability("admin", "security.events.read")).toBe(true);
    expect(hasCapability("manager", "security.events.read")).toBe(false);
    expect(hasCapability("instructor", "security.events.read")).toBe(false);
  });

  it("fails closed before an authoritative account exists", () => {
    expect(hasCapability(null, "admin.area")).toBe(false);
    expect(accountScopeKey(null)).toBe("anon");
    expect(instructorIdFor(null)).toBeNull();
  });

  it("builds cache scope and instructor identity from the same verified account", () => {
    const account = { id: 42, role: "instructor" as const, accessVersion: 7 };
    expect(accountScopeKey(account)).toBe("42:instructor:v7");
    expect(instructorIdFor(account)).toBe(42);
    expect(instructorIdFor({ id: 42, role: "manager" })).toBeNull();
  });

  it("uses the server effective projection instead of recomputing role defaults", () => {
    const deniedManager = { effectiveCapabilities: ["staff.login"] as const };
    const grantedInstructor = { effectiveCapabilities: ["staff.login", "calendar.manage"] as const };
    expect(accountHasCapability(deniedManager, "calendar.manage")).toBe(false);
    expect(accountHasCapability(grantedInstructor, "calendar.manage")).toBe(true);
    expect(accountHasCapability(null, "calendar.manage")).toBe(false);
  });
});
