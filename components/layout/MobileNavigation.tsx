"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui";
import { isNavigationItemActive, type NavigationItem } from "./navigation";
import { useAppNavigation } from "./useAppNavigation";

const PRIMARY_HREFS = ["/", "/calendar", "/attendance", "/reports"] as const;

function NavigationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute right-[calc(50%-18px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function MobileNavigation() {
  const pathname = usePathname();
  const { account, role, groups, badges } = useAppNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const primaryItems = PRIMARY_HREFS
    .map((href) => allItems.find((item) => item.href === href))
    .filter((item): item is NavigationItem => Boolean(item));

  useEffect(() => setMenuOpen(false), [pathname]);
  if (!account || !role) return null;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-canvas/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(31,35,40,0.08)] backdrop-blur md:hidden"
        aria-label="모바일 주요 메뉴"
      >
        <div className="grid h-16 grid-cols-5">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isNavigationItemActive(pathname, item.href);
            const count = badges[item.href] ?? 0;
            return (
              <Link
                key={`${item.label}:${item.href}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-micro font-medium no-underline ${
                  active ? "text-accent" : "text-fg-muted"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full truncate">{item.label === "수업 보고서" ? "리포트" : item.label}</span>
                <NavigationBadge count={count} />
              </Link>
            );
          })}
          <button
            type="button"
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-micro font-medium ${
              menuOpen ? "text-accent" : "text-fg-muted"
            }`}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <IconGrid className="h-5 w-5" aria-hidden="true" />
            <span>전체</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <ModalShell
          title={`${account.name} · 전체 메뉴`}
          size="lg"
          onClose={() => setMenuOpen(false)}
          bodyClassName="space-y-4"
          footer={<button type="button" className="btn w-full sm:w-auto" onClick={() => setMenuOpen(false)}>닫기</button>}
        >
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-1.5 text-caption font-semibold text-fg-subtle">{group.title}</h2>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavigationItemActive(pathname, item.href);
                  const count = badges[item.href] ?? 0;
                  return (
                    <Link
                      key={`${item.label}:${item.href}`}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex min-h-12 min-w-0 items-center gap-2 rounded-md border px-3 text-body font-medium no-underline ${
                        active ? "border-accent bg-accent-subtle text-accent" : "bg-canvas text-fg"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {count > 0 && <span className="badge badge-danger ml-auto shrink-0">{count > 99 ? "99+" : count}</span>}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </ModalShell>
      )}
    </>
  );
}
