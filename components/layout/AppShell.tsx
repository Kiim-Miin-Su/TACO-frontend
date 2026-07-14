// [참조/처리] 앱 크롬(사이드바/탑바) + 역할 동기화.
//  - 공개(인증) 경로는 크롬 없이 전체화면. 그 외에는 토큰→currentRole 동기화.
//  - 서버 데이터는 각 뷰가 필요 시 TanStack Query 훅으로 직접 패칭한다(단일 소스: 백엔드).
"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims } from "@/lib/auth";
import { isPublicRoute } from "@/lib/auth-routes";
import { useTacoStore } from "@/lib/store";
import type { AccountRole } from "@/types";

type AccessMode = "loading" | "locked" | "open";

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const publicRoute = isPublicRoute(pathname);
  const [accessMode, setAccessMode] = useState<AccessMode>("loading");

  // 로그인된 경우에만 역할을 앱 전역 currentRole에 반영(공개 경로에선 동기화하지 않음).
  useEffect(() => {
    if (publicRoute) {
      setAccessMode("loading");
      return;
    }
    const claims = currentClaims();
    const role = claims?.roles?.[0];
    if (claims && role) {
      const accountRole = role as AccountRole;
      setCurrentRole(accountRole);
      setCurrentAccount({ id: claims.sub, name: claims.name, role: accountRole });
      const locked = claims.mustChangePassword === true;
      setAccessMode(locked ? "locked" : "open");
      if (locked && pathname !== "/account/security") router.replace("/account/security");
    } else {
      setAccessMode("loading");
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, publicRoute, router, setCurrentAccount, setCurrentRole]);

  if (publicRoute) return <>{children}</>;
  if (accessMode === "loading") {
    return <main className="grid min-h-screen place-items-center bg-canvas text-body text-fg-muted">계정 확인 중...</main>;
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
