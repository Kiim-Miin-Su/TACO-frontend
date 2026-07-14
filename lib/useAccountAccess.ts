"use client";

import { useCallback } from "react";
import { accountScopeKey, hasCapability, instructorIdFor, type AppCapability } from "@/lib/access-control";
import { useTacoStore } from "@/lib/store";

/** `/auth/me` 검증 후 AppShell이 저장한 계정만 UI와 query gating에 사용한다. */
export function useAccountAccess() {
  const account = useTacoStore((state) => state.currentAccount);
  const role = account?.role ?? null;
  const can = useCallback(
    (capability: AppCapability) => hasCapability(role, capability),
    [role],
  );

  return {
    account,
    role,
    scope: accountScopeKey(account),
    instructorId: instructorIdFor(account),
    authenticated: account != null,
    can,
  };
}
