// [참조/처리] 앱 크롬(사이드바/탑바) + 역할 동기화.
//  - 공개(인증) 경로는 크롬 없이 전체화면. 그 외에는 토큰→currentRole 동기화.
//  - 서버 데이터는 각 뷰가 필요 시 TanStack Query 훅으로 직접 패칭한다(단일 소스: 백엔드).
"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims, getToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { isPublicRoute } from "@/lib/auth-routes";
import { useTacoStore } from "@/lib/store";
import { BACKOFFICE_ROLES } from "@/lib/roles";
import type { AccountRole } from "@/types";

type AccessMode = "loading" | "locked" | "open" | "error";
type VerifiedClaims = Awaited<ReturnType<typeof api.auth.me>>;

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const publicRoute = isPublicRoute(pathname);
  const [accessMode, setAccessMode] = useState<AccessMode>("loading");
  const verifiedToken = useRef<string | null>(null);
  const verifiedClaims = useRef<VerifiedClaims | null>(null);

  // 쿠키/로컬 decode는 빠른 분기만 담당한다. 업무 children은 /auth/me 권위 검증 전 마운트하지 않는다.
  useEffect(() => {
    if (publicRoute) {
      setAccessMode("loading");
      return;
    }
    const token = getToken();
    const localClaims = currentClaims();
    if (!token || !localClaims) {
      setAccessMode("loading");
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    let alive = true;
    const apply = (claims: VerifiedClaims) => {
      const role = claims.roles?.[0] as AccountRole | undefined;
      if (!role || !BACKOFFICE_ROLES.includes(role)) {
        setAccessMode("error");
        return;
      }
      const accountRole = role as AccountRole;
      setCurrentRole(accountRole);
      setCurrentAccount({ id: claims.sub, name: claims.name, role: accountRole });
      const locked = claims.mustChangePassword === true;
      setAccessMode(locked ? "locked" : "open");
      if (locked && pathname !== "/account/security") router.replace("/account/security");
    };

    if (verifiedToken.current === token && verifiedClaims.current) {
      apply(verifiedClaims.current);
      return;
    }

    setAccessMode("loading");
    api.auth.me()
      .then((claims) => {
        if (!alive) return;
        verifiedToken.current = token;
        verifiedClaims.current = claims;
        apply(claims);
      })
      .catch(() => { if (alive) setAccessMode("error"); });
    return () => { alive = false; };
  }, [pathname, publicRoute, router, setCurrentAccount, setCurrentRole]);

  if (publicRoute) return <>{children}</>;
  if (accessMode === "loading") {
    return <main className="grid min-h-screen place-items-center bg-canvas text-body text-fg-muted">계정 확인 중...</main>;
  }
  if (accessMode === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="text-center space-y-3">
          <p className="text-body text-fg-muted">계정 정보를 확인하지 못했습니다.</p>
          <button className="btn btn-sm" onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </main>
    );
  }
  if (accessMode === "locked") {
    if (pathname !== "/account/security") {
      return <main className="grid min-h-screen place-items-center bg-canvas text-body text-fg-muted">보안 설정으로 이동 중...</main>;
    }
    return <main className="min-h-screen overflow-y-auto bg-canvas">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
