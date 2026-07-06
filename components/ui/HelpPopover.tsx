"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * HelpPopover — 조작법·단축키 등 읽기 전용 도움말 ⓘ 팝오버 (DESIGN.md §5.5).
 * 페이지 부제에 설명서를 상주시키지 않기 위한 대체 수단.
 * 높이 §2.4: max-h-[320px] 내부 스크롤. 바깥 클릭으로 닫힘.
 */
export function HelpPopover({ title = "도움말", children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="btn btn-sm btn-invisible w-7 px-0 rounded-full"
        aria-label={title}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        ⓘ
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[50] card p-3 w-[300px] max-w-[85vw] max-h-[320px] overflow-y-auto shadow-[var(--shadow-overlay)]">
          <div className="text-caption font-semibold text-fg-muted mb-1.5">{title}</div>
          <div className="text-caption text-fg-muted space-y-1">{children}</div>
        </div>
      )}
    </div>
  );
}
