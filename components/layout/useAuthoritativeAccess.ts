"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { currentClaims, getToken } from "@/lib/auth";
import { resolveBackofficeRole } from "@/lib/access-control";
import { useTacoStore } from "@/lib/store";

export type AccessMode = "loading" | "locked" | "open" | "error";
type VerifiedClaims = Awaited<ReturnType<typeof api.auth.me>>;

/**
 * 브라우저 인증 상태를 권위 `/auth/me` 응답과 동기화한다.
 * 이 effect만 네트워크, router, Zustand라는 외부 시스템을 연결한다.
 */
export function useAuthoritativeAccess(pathname: string, publicRoute: boolean): AccessMode {
  const router = useRouter();
  const setCurrentRole = useTacoStore((state) => state.setCurrentRole);
  const setCurrentAccount = useTacoStore((state) => state.setCurrentAccount);
  const [mode, setMode] = useState<AccessMode>("loading");
  const verifiedToken = useRef<string | null>(null);
  const verifiedClaims = useRef<VerifiedClaims | null>(null);

  useEffect(() => {
    if (publicRoute) {
      setMode("loading");
      return;
    }

    const token = getToken();
    if (!token || !currentClaims()) {
      setMode("loading");
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    let alive = true;
    const apply = (claims: VerifiedClaims) => {
      const role = resolveBackofficeRole(claims.roles ?? []);
      if (!role) {
        setCurrentAccount(null);
        setMode("error");
        return;
      }
      setCurrentRole(role);
      setCurrentAccount({ id: claims.sub, name: claims.name, role });
      const locked = claims.mustChangePassword === true;
      setMode(locked ? "locked" : "open");
      if (locked && pathname !== "/account/security") router.replace("/account/security");
    };

    if (verifiedToken.current === token && verifiedClaims.current) {
      apply(verifiedClaims.current);
      return;
    }

    setMode("loading");
    api.auth.me()
      .then((claims) => {
        if (!alive) return;
        verifiedToken.current = token;
        verifiedClaims.current = claims;
        apply(claims);
      })
      .catch(() => {
        if (!alive) return;
        setCurrentAccount(null);
        setMode("error");
      });
    return () => { alive = false; };
  }, [pathname, publicRoute, router, setCurrentAccount, setCurrentRole]);

  return mode;
}
