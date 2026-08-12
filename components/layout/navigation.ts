import type { ComponentType, SVGProps } from "react";
import type { AppCapability } from "@/lib/access-control";
import type { InternalHref } from "@/lib/navigation-security";
import {
  IconBook,
  IconCalendar,
  IconCard,
  IconChat,
  IconGrid,
  IconHome,
  IconReceipt,
  IconReport,
  IconSettings,
  IconUsers,
  IconWallet,
} from "@/components/ui/icons";

export type NavigationItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: InternalHref;
  capability?: AppCapability;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    title: "운영",
    items: [
      { label: "대시보드", icon: IconHome, href: "/" },
      { label: "캘린더", icon: IconCalendar, href: "/calendar" },
      { label: "상담", icon: IconChat, href: "/counsel", capability: "counsel.manage" },
      { label: "학생 · 부모", icon: IconUsers, href: "/students" },
      { label: "수업", icon: IconBook, href: "/sessions" },
      { label: "강사", icon: IconUsers, href: "/admin/instructors", capability: "admin.area" },
    ],
  },
  {
    title: "입금",
    items: [{ label: "결제 · 수납", icon: IconCard, href: "/payments", capability: "finance.access" }],
  },
  {
    title: "출금",
    items: [
      { label: "강사 시수", icon: IconWallet, href: "/payouts", capability: "finance.access" },
      { label: "내 정산", icon: IconWallet, href: "/payouts", capability: "instructor.self" },
      { label: "지출 · 비품", icon: IconReceipt, href: "/expenses", capability: "finance.access" },
    ],
  },
  {
    title: "기타",
    items: [
      { label: "출석부", icon: IconReport, href: "/attendance" },
      { label: "수업 보고서", icon: IconReport, href: "/reports" },
      { label: "관리자", icon: IconGrid, href: "/admin", capability: "admin.area" },
      { label: "마이 페이지", icon: IconSettings, href: "/account" },
    ],
  },
  {
    title: "경영",
    items: [{ label: "경영 지표", icon: IconReceipt, href: "/insights", capability: "finance.access" }],
  },
];

export const visibleNavigationGroups = (
  can: (capability: AppCapability) => boolean,
): NavigationGroup[] => NAVIGATION_GROUPS
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || can(item.capability)),
  }))
  .filter((group) => group.items.length > 0);

export const isNavigationItemActive = (pathname: string, href: InternalHref): boolean =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);
