"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

const interactiveSelector = "a,button,input,select,textarea,[role='button'],[role='link']";

export function ClickableTableRow({
  href,
  label,
  children,
  className = "",
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const open = () => router.push(href);
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
      role="link"
      tabIndex={0}
      aria-label={label}
      className={`cursor-pointer focus-visible:outline-none focus-visible:[&>td]:bg-[var(--color-accent-subtle)] ${className}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => router.prefetch(href)}
    >
      {children}
    </tr>
  );
}
