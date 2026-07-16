// [참조/처리] 앱 크롬(사이드바/탑바) + 역할 동기화.
//  - 공개(인증) 경로는 크롬 없이 전체화면. 그 외에는 토큰→currentRole 동기화.
//  - 서버 데이터는 각 뷰가 필요 시 TanStack Query 훅으로 직접 패칭한다(단일 소스: 백엔드).
"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { isPublicRoute } from "@/lib/auth-routes";
import { useAuthoritativeAccess } from "@/components/layout/useAuthoritativeAccess";
import { useMarkNavSeen } from "@/lib/queries";

// [B3 2026-07-16 대표 결정 ①] 뱃지 탭 진입 = 열람 마킹. 뱃지가 있는 탭 루트만 매핑(허용 키는 서버와 1:1).
const NAV_SEEN_ROOTS: Array<[prefix: string, key: string]> = [
  ["/calendar", "calendar"], ["/counsel", "counsel"], ["/payments", "payments"],
  ["/payouts", "payouts"], ["/expenses", "expenses"], ["/reports", "reports"], ["/admin", "admin"],
];

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);
  const accessMode = useAuthoritativeAccess(pathname, publicRoute);
  // [B3] 탭 진입 열람 마킹 — 같은 탭 안에서의 라우팅은 1회만(중복 upsert 억제).
  const markSeen = useMarkNavSeen();
  const lastMarked = useRef<string | null>(null);
  const navKey = NAV_SEEN_ROOTS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;
  const canMark = !publicRoute && accessMode === "open";
  useEffect(() => {
    if (!canMark || !navKey || lastMarked.current === navKey) return;
    lastMarked.current = navKey;
    markSeen.mutate(navKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMark, navKey]);

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
