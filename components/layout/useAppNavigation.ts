"use client";

import { useAccountAccess } from "@/lib/useAccountAccess";
import { useNavSeen, useTaskData } from "@/lib/queries";
import { navBadges } from "@/lib/tasks";
import { visibleNavigationGroups } from "./navigation";

export function useAppNavigation() {
  const access = useAccountAccess();
  const taskData = useTaskData();
  const { data: navSeen } = useNavSeen();
  const role = access.role;
  const groups = visibleNavigationGroups((capability) => access.can(capability));
  const badges = role
    ? navBadges({ ...taskData, currentRole: role }, role, access.instructorId ?? undefined, navSeen)
    : {};

  return {
    access,
    account: access.account,
    role,
    groups,
    badges,
  };
}
