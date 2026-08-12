"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
  const setCurrentAccount = useTacoStore((state) => state.setCurrentAccount); // [75B] currentRole 레거시 제거
  const [mode, setMode] = useState<AccessMode>("loading");
  const verifiedClaims = useRef<VerifiedClaims | null>(null);

  useEffect(() => {
    if (publicRoute) {
      setMode("loading");
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
      setCurrentAccount({
        id: claims.sub,
        name: claims.name,
        englishName: claims.englishName,
        role,
        mustChangePassword: claims.mustChangePassword === true,
        accessVersion: claims.accessVersion,
        effectiveCapabilities: claims.effectiveCapabilities,
      });
      const locked = claims.mustChangePassword === true;
      setMode(locked ? "locked" : "open");
      if (locked && pathname !== "/account/security") router.replace("/account/security");
    };

    if (verifiedClaims.current) {
      apply(verifiedClaims.current);
      return;
    }

    setMode("loading");
    api.auth.me()
      .then((claims) => {
        if (!alive) return;
        verifiedClaims.current = claims;
        apply(claims);
      })
      .catch(() => {
        if (!alive) return;
        setCurrentAccount(null);
        setMode("error");
      });
    return () => { alive = false; };
  }, [pathname, publicRoute, router, setCurrentAccount]);

  return mode;
}
