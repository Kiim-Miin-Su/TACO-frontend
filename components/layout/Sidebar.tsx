"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTacoStore } from "@/lib/store";
import { useScheduleResources, useTaskData } from "@/lib/queries";
import { booleanPreferenceCodec, preferenceKeys, readPreference, writePreference } from "@/lib/storage/preferences";
import { roleLabel, isCEO, isAdmin, canAccessFinance } from "@/lib/roles";
import { navBadges } from "@/lib/tasks";
import { myInstructorId } from "@/lib/auth";
import {
  IconHome,
  IconUsers,
  IconBook,
  IconCard,
  IconWallet,
  IconReceipt,
  IconReport,
  IconSettings,
  IconChat,
  IconGrid,
  IconCalendar,
} from "../ui/icons";

type Item = { label: string; icon: React.FC<any>; href: string; adminOnly?: boolean; financeOnly?: boolean; instructorVisible?: boolean };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "운영",
    items: [
      { label: "대시보드", icon: IconHome, href: "/" },
      { label: "캘린더", icon: IconCalendar, href: "/calendar" },
      { label: "상담", icon: IconChat, href: "/counsel" },
      { label: "학생 · 부모", icon: IconUsers, href: "/students" },
      { label: "수업 (강사)", icon: IconBook, href: "/sessions" },
    ],
  },
  {
    title: "입금",
    items: [{ label: "결제 · 수납", icon: IconCard, href: "/payments", financeOnly: true }],
  },
  {
    title: "출금",
    items: [
      { label: "강사 페이", icon: IconWallet, href: "/payouts", financeOnly: true, instructorVisible: true },
      { label: "지출 · 비품", icon: IconReceipt, href: "/expenses", financeOnly: true },
    ],
  },
  {
    title: "기타",
    items: [
      { label: "출석부", icon: IconReport, href: "/attendance" }, // LMS형 회차×학생 매트릭스(2026-07-03)
      { label: "수업 보고서", icon: IconReport, href: "/reports" },
      { label: "관리자", icon: IconGrid, href: "/admin", adminOnly: true },
      { label: "마이 페이지", icon: IconSettings, href: "/account" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  // 현재 역할/계정 표시는 로그인 JWT에서 AppShell이 동기화한 클라이언트 상태다.
  const role = useTacoStore((s) => s.currentRole);
  const currentAccount = useTacoStore((s) => s.currentAccount);
  // 탭별 알림 배지 — 서버 데이터는 TanStack Query(useAppData) 단일 소스에서 조립해 navBadges에 넘긴다.
  //  처리(리포트 작성·승인 등) 시 관련 쿼리가 invalidate되면 배지도 함께 갱신됨.
  const badges = navBadges({ ...useTaskData(), currentRole: role }, role, myInstructorId() ?? undefined);
  // 강사/학생 역할은 백엔드 자원에서 대표 인물명을 가져와 표시(참조 무결성: 역할↔표시 일치)
  const resources = useScheduleResources().data;
  const people = { instructor: resources?.instructors[0]?.name, student: resources?.students[0]?.name };
  // 직책이 아니라 실제 이름. 로그인 계정 우선, 초기 hydrate 전에는 역할 기본 라벨.
  const fallbackName =
    role === "instructor" ? people.instructor ?? "강사"
      : role === "student" ? people.student ?? "학생"
        : role === "parent" ? "최영희"
          : role === "manager" ? "이지원"
            : "김민수"; // super_admin / admin
  const identity = { name: currentAccount?.name ?? fallbackName };

  // 좌측 네비 접기/펴기 — 화면 가로 비율 조절. 선택값은 typed preference storage에 보존.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(readPreference(preferenceKeys.uiSidebarCollapsed, false, booleanPreferenceCodec, { legacyKeys: ["sidebarCollapsed"] }));
  }, []);
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      writePreference(preferenceKeys.uiSidebarCollapsed, next, booleanPreferenceCodec);
      return next;
    });
  };

  return (
    <aside className={`${collapsed ? "w-14" : "w-14 sm:w-60"} shrink-0 border-r flex flex-col bg-canvas transition-[width] duration-200`}>
      <div className={`h-14 flex items-center border-b ${collapsed ? "justify-center px-0" : "justify-center px-0 sm:justify-start sm:gap-2.5 sm:px-4"}`}>
        <div className="w-7 h-7 rounded-md grid place-items-center text-fg-onemph font-bold text-body bg-[var(--color-fg)] shrink-0">
          <Link href="/">T</Link>
        </div>
        {!collapsed && (
          <>
            <div className="hidden leading-tight flex-1 sm:block">
              <div className="font-semibold text-section">TACO ERP</div>
              <div className="text-micro text-fg-subtle">TnAcademy</div>
            </div>
            <button onClick={toggle} title="네비 접기" className="hidden w-6 h-6 place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section sm:grid">«</button>
          </>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} title="네비 펴기" className="mx-auto mt-2 w-8 h-7 grid place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section">»</button>
      )}

      <nav className="flex-1 overflow-y-auto py-3">
        {(isCEO(role)
          ? [...groups, { title: "경영", items: [{ label: "경영 지표", icon: IconReceipt, href: "/insights" }] }]
          : groups
        )
          // adminOnly 항목은 관리자 역할에게만 노출(M1). 항목이 비면 그룹째 숨김.
          .map((g) => ({
            ...g,
            items: g.items.filter((it: Item) =>
              (!it.adminOnly || isAdmin(role)) &&
              (!it.financeOnly || canAccessFinance(role) || (it.instructorVisible && role === "instructor")),
            ),
          }))
          .filter((g) => g.items.length > 0)
          .map((g) => (
          <div key={g.title} className={`mb-3 ${collapsed ? "px-1.5" : "px-1.5 sm:px-3"}`}>
            {!collapsed && <div className="hidden px-2 mb-1 text-micro font-semibold uppercase tracking-wide text-fg-subtle sm:block">{g.title}</div>}
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it.href);
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  title={it.label}
                  aria-label={it.label}
                  className={`relative flex items-center h-8 rounded-md text-body mb-0.5 ${collapsed ? "justify-center px-0" : "justify-center px-0 sm:justify-start sm:gap-2.5 sm:px-2"} ${
                    active ? "bg-neutral-subtle font-semibold text-fg" : "text-fg-muted hover:bg-canvas-subtle hover:text-fg"
                  }`}
                >
                  <Icon className="text-fg-subtle" />
                  {!collapsed && <span className="hidden flex-1 sm:block">{it.label}</span>}
                  {/* 역할별 이벤트 빨간 배지(navBadges). 접힘 상태에선 점만. */}
                  {(badges[it.href] ?? 0) > 0 && (
                    <span
                      className={`grid place-items-center rounded-full bg-danger text-[10px] font-bold text-white leading-none ${collapsed ? "absolute top-1 right-1 w-2 h-2" : "absolute top-1 right-1 w-2 h-2 sm:static sm:min-w-[16px] sm:h-[16px] sm:w-auto sm:px-1"}`}

                      title={`${badges[it.href]}건`}
                    >
                      <span className={collapsed ? "hidden" : "hidden sm:inline"}>{badges[it.href]}</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t flex items-center ${collapsed ? "justify-center p-3" : "justify-center p-3 sm:justify-start sm:gap-2.5"}`}>
        <div className="w-7 h-7 rounded-full bg-neutral-subtle grid place-items-center text-caption font-semibold text-fg-muted shrink-0" title={collapsed ? `${identity.name} · ${roleLabel[role]}` : undefined}>
          {identity.name.slice(0, 1)}
        </div>
        {!collapsed && (
          <div className="hidden leading-tight flex-1 sm:block">
            <div className="text-body font-medium">{identity.name}</div>
            <div className="text-micro text-fg-subtle">{roleLabel[role]}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
