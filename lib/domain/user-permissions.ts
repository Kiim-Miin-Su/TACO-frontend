import type { CapabilityOverrideMode, UserCapabilityPermission } from "@kms545487/contracts";

export type PermissionToggle = {
  permission: UserCapabilityPermission;
  mode: CapabilityOverrideMode;
  nextEffective: boolean;
};

export function permissionToggle(permission: UserCapabilityPermission): PermissionToggle {
  const nextEffective = !permission.effective;
  const mode: CapabilityOverrideMode = nextEffective === permission.roleDefault
    ? "default"
    : nextEffective ? "allow" : "deny";
  return { permission, mode, nextEffective };
}
