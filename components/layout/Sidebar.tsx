"use client";
import Link from "next/link";
import BrandMark from "@/components/brand/BrandMark";
import { usePathname } from "next/navigation";
import { useTaskData, useNavSeen } from "@/lib/queries";
import { booleanPreferenceCodec, preferenceKeys } from "@/lib/storage/preferences";
import { roleLabel } from "@/lib/roles";
import { navBadges } from "@/lib/tasks";
import { usePersistedState } from "@/lib/usePersistedState";
import { useAccountAccess } from "@/lib/useAccountAccess";
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

type Item = { label: string; icon: React.FC<any>; href: string; adminOnly?: boolean; counselOnly?: boolean; financeOnly?: boolean; instructorVisible?: boolean };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "운영",
    items: [
      { label: "대시보드", icon: IconHome, href: "/" },
      { label: "캘린더", icon: IconCalendar, href: "/calendar" },
      { label: "상담", icon: IconChat, href: "/counsel", counselOnly: true },
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

const SIDEBAR_PREFERENCE_OPTIONS = { legacyKeys: ["sidebarCollapsed"] } as const;

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const access = useAccountAccess();
  const role = access.role;
  const currentAccount = access.account;
  const taskData = useTaskData();
  // [B3 2026-07-16] 탭별 마지막 열람 시각 — 열람 후 새 활동 없으면 뱃지 숨김(서버 영속·기기 간 동기).
  const { data: navSeen } = useNavSeen();
  // 탭별 알림 배지 — 서버 데이터는 TanStack Query(useAppData) 단일 소스에서 조립해 navBadges에 넘긴다.
  //  처리(리포트 작성·승인 등) 시 관련 쿼리가 invalidate되면 배지도 함께 갱신됨.
  const badges = role
    ? navBadges({ ...taskData, currentRole: role }, role, access.instructorId ?? undefined, navSeen)
    : {};

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
    <aside className={`${collapsed ? "w-14" : "w-14 sm:w-60"} shrink-0 border-r flex flex-col bg-canvas transition-[width] duration-200`}>
      <div className={`h-14 flex items-center border-b ${collapsed ? "justify-center px-0" : "justify-center px-0 sm:justify-start sm:gap-2.5 sm:px-4"}`}>
        <Link href="/" aria-label="TACO ERP 홈" className="w-7 h-7 rounded-md shrink-0">
          <BrandMark size={28} className="rounded-md" priority />
        </Link>
        {!collapsed && (
          <>
            <div className="hidden leading-tight flex-1 sm:block">
              <div className="font-semibold text-section">TACO ERP</div>
              <div className="text-micro text-fg-subtle">TN Academy</div>
            </div>
            <button onClick={toggle} title="네비 접기" className="hidden w-6 h-6 place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section sm:grid">«</button>
          </>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} title="네비 펴기" className="mx-auto mt-2 w-8 h-7 grid place-items-center rounded text-fg-subtle hover:bg-canvas-subtle text-section">»</button>
      )}

      <nav className="flex-1 overflow-y-auto py-3">
        {(access.can("signup.decide")
          ? [...groups, { title: "경영", items: [{ label: "경영 지표", icon: IconReceipt, href: "/insights" }] }]
          : groups
        )
          // adminOnly 항목은 관리자 역할에게만 노출(M1). 항목이 비면 그룹째 숨김.
          .map((g) => ({
            ...g,
            items: g.items.filter((it: Item) =>
              (!it.adminOnly || access.can("admin.area")) &&
              (!it.counselOnly || access.can("counsel.manage")) &&
              (!it.financeOnly || access.can("finance.access") || (it.instructorVisible && access.can("instructor.self"))),
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
