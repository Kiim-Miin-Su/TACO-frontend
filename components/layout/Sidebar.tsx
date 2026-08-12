"use client";
import Link from "next/link";
import BrandMark from "@/components/brand/BrandMark";
import { usePathname } from "next/navigation";
import { booleanPreferenceCodec, preferenceKeys } from "@/lib/storage/preferences";
import { roleLabel } from "@/lib/roles";
import { usePersistedState } from "@/lib/usePersistedState";
import { isNavigationItemActive } from "./navigation";
import { useAppNavigation } from "./useAppNavigation";
import TaskCountBadge from "./TaskCountBadge";

const SIDEBAR_PREFERENCE_OPTIONS = { legacyKeys: ["sidebarCollapsed"] } as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { account: currentAccount, role, groups, badges } = useAppNavigation();

  // 좌측 네비 접기/펴기 — 화면 가로 비율 조절. 선택값은 typed preference storage에 보존.
  const [collapsed, setCollapsed] = usePersistedState(
    preferenceKeys.uiSidebarCollapsed,
    false,
    booleanPreferenceCodec,
    SIDEBAR_PREFERENCE_OPTIONS,
  );
  const toggle = () => setCollapsed((value) => !value);

  if (!role || !currentAccount) return null;

  return (
    <aside className={`${collapsed ? "w-14" : "w-60"} hidden shrink-0 flex-col border-r bg-canvas transition-[width] duration-200 md:flex`}>
      <div className={`h-14 flex items-center border-b ${collapsed ? "justify-center px-0" : "justify-center px-0 sm:justify-start sm:gap-2.5 sm:px-4"}`}>
        <Link
          href="/"
          aria-label="TACO ERP 홈으로 이동"
          title="홈으로 이동"
          className={`flex min-w-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg ${collapsed ? "" : "sm:flex-1 sm:gap-2.5"}`}
        >
          <BrandMark size={28} className="rounded-md shrink-0" priority />
          {!collapsed && (
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="font-semibold text-section">TACO ERP</div>
              <div className="text-micro text-fg-subtle">TN Academy</div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button onClick={toggle} title="네비 접기" className="hidden w-6 h-6 place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section sm:grid">«</button>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} title="네비 펴기" className="mx-auto mt-2 w-8 h-7 grid place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section">»</button>
      )}

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g.title} className={`mb-3 ${collapsed ? "px-1.5" : "px-1.5 sm:px-3"}`}>
            {!collapsed && <div className="hidden px-2 mb-1 text-micro font-semibold uppercase tracking-wide text-fg-subtle sm:block">{g.title}</div>}
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = isNavigationItemActive(pathname, it.href);
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
                  <TaskCountBadge
                    count={badges[it.href]}
                    dot={collapsed}
                    className={collapsed ? "absolute right-1 top-1" : "absolute right-1 top-1 sm:static"}
                  />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t flex items-center ${collapsed ? "justify-center p-3" : "justify-center p-3 sm:justify-start sm:gap-2.5"}`}>
        <div className="w-7 h-7 rounded-full bg-neutral-subtle grid place-items-center text-caption font-semibold text-fg-muted shrink-0" title={collapsed ? `${currentAccount.name} · ${roleLabel[role]}` : undefined}>
          {currentAccount.name.slice(0, 1)}
        </div>
        {!collapsed && (
          <div className="hidden leading-tight flex-1 sm:block">
            <div className="text-body font-medium">{currentAccount.name}</div>
            <div className="text-micro text-fg-subtle">{roleLabel[role]}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
