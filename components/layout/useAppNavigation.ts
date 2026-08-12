"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { useTaskData } from "@/lib/queries";
import { buildTasks } from "@/lib/tasks";
import { visibleNavigationGroups } from "./navigation";

function useAppNavigationSource() {
  const access = useAccountAccess();
  const taskData = useTaskData();
  const role = access.role;
  const groups = visibleNavigationGroups((capability) => access.can(capability));
  const tasks = role
    ? buildTasks({ ...taskData, currentRole: role }, role, access.instructorId ?? undefined)
    : { items: [], count: 0, badges: { total: 0, byDestination: {}, byNavigation: {} } };

  return {
    access,
    account: access.account,
    role,
    groups,
    taskItems: tasks.items,
    taskCount: tasks.count,
    badges: tasks.badges.byNavigation,
    destinationBadges: tasks.badges.byDestination,
  };
}

type AppNavigationValue = ReturnType<typeof useAppNavigationSource>;
const AppNavigationContext = createContext<AppNavigationValue | null>(null);

/** 앱 크롬과 하위 관리자 탭이 업무 데이터/배지 투영을 한 번만 구독하도록 하는 경계. */
export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const value = useAppNavigationSource();
  return createElement(AppNavigationContext.Provider, { value }, children);
}

export function useAppNavigation(): AppNavigationValue {
  const value = useContext(AppNavigationContext);
  if (!value) throw new Error('useAppNavigation must be used within AppNavigationProvider');
  return value;
}
