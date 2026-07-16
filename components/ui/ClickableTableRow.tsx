// [B6 C3 2026-07-16] onActivate 모드 추가 — 모달 진입 행도 단일 컴포넌트(키보드 접근 통일, E2)
"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

const interactiveSelector = "a,button,input,select,textarea,[role='button'],[role='link']";

type CommonProps = {
  label: string;
  children: ReactNode;
  className?: string;
  /** 행 hover 툴팁(기존 수기 tr의 title 유지용) */
  title?: string;
  /** data-testid 유지용(승인 센터 행 등) */
  testId?: string;
};

// href = 상세 라우팅 행(role="link", prefetch) / onActivate = 모달 진입 행(role="button", prefetch 없음)
type ClickableTableRowProps = CommonProps &
  ({ href: string; onActivate?: never } | { href?: never; onActivate: () => void });

export function ClickableTableRow({
  href,
  onActivate,
  label,
  children,
  className = "",
  title,
  testId,
}: ClickableTableRowProps) {
  const router = useRouter();
  const open = () => {
    if (href != null) router.push(href);
    else onActivate?.();
  };
  const isNestedInteractive = (target: EventTarget | null, currentTarget: HTMLTableRowElement) => {
    if (!(target instanceof Element)) return false;
    const interactive = target.closest(interactiveSelector);
    return interactive != null && interactive !== currentTarget;
  };

  const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (!isNestedInteractive(event.target, event.currentTarget)) open();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    open();
  };

  return (
    <tr
      role={href != null ? "link" : "button"}
      tabIndex={0}
      aria-label={label}
      title={title}
      data-testid={testId}
      className={`cursor-pointer focus-visible:outline-none focus-visible:[&>td]:bg-[var(--color-accent-subtle)] ${className}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={href != null ? () => router.prefetch(href) : undefined}
    >
      {children}
    </tr>
  );
}
