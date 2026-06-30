"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims } from "@/lib/auth";
import { useTacoStore } from "@/lib/store";
import type { AccountRole } from "@/types";

// 로그인 페이지는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);

  // 토큰이 있으면 로그인된 역할을 앱 전역 currentRole에 반영(사이드바 신원·캘린더 권한 등).
  useEffect(() => {
    const claims = currentClaims();
    const role = claims?.roles?.[0];
    if (role) setCurrentRole(role as AccountRole);
  }, [pathname, setCurrentRole]);

  if (pathname === "/login") return <>{children}</>;

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
