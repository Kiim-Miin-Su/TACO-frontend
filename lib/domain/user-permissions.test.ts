import { describe, expect, it } from "vitest";
import type { UserCapabilityPermission } from "@kms545487/contracts";
import { permissionToggle } from "./user-permissions";

const permission = (
  roleDefault: boolean,
  effective: boolean,
  override: UserCapabilityPermission["override"],
): UserCapabilityPermission => ({
  capability: "calendar.manage",
  category: "calendar",
  label: "캘린더 관리",
  description: "",
  configurable: true,
  executiveOnly: false,
  manageable: true,
  roleDefault,
  effective,
  override,
});

describe("permissionToggle", () => {
  it("creates a deny override when disabling an allowed role default", () => {
    expect(permissionToggle(permission(true, true, null))).toMatchObject({ mode: "deny", nextEffective: false });
  });

  it("creates an allow override when enabling a denied role default", () => {
    expect(permissionToggle(permission(false, false, null))).toMatchObject({ mode: "allow", nextEffective: true });
  });

  it("restores the role default when reversing an override", () => {
    expect(permissionToggle(permission(true, false, "deny"))).toMatchObject({ mode: "default", nextEffective: true });
    expect(permissionToggle(permission(false, true, "allow"))).toMatchObject({ mode: "default", nextEffective: false });
  });
});
