"use client";
// Figma v2 CalendarPane과 근태 화면이 공유하는 검색형 다중선택 컨트롤.
//  - 리소스 다중선택(강사 👓 / 학생 🎓 / 강의실 🚪): 체크박스 팝오버(검색 + 색 스와치) — Lantiv 'Name' 드롭다운 대응.
//  - 선택 상태는 소비 화면 reducer가 소유한다. 이 컴포넌트는 표시·검색·선택 콜백만 담당한다.
import { useEffect, useMemo, useRef, useState } from "react";

// [#2 2026-07-06] subject 추가 — 수동 표 빌더의 과목 차원 MultiPick 지원.
export type FilterDim = "instructor" | "student" | "room" | "subject";

const DIM_META: Record<FilterDim, { icon: string; label: string }> = {
  instructor: { icon: "👓", label: "강사" },
  student: { icon: "🎓", label: "학생" },
  room: { icon: "🚪", label: "강의실" },
  subject: { icon: "📚", label: "과목" },
};

type Option = { id: number; name: string; color?: string; sub?: string };

// ── [일관성 2026-07-06] 범용 옵션 팝오버 — 리소스(MultiPick)와 같은 "버튼+▾+체크 팝오버" 문법을
//  상태·종류·유형·과목 필터에 공통 적용(인라인 칩 나열 → 팝오버 통일, 대표 지시). 빈 선택=전체.
export function OptionPick({
  icon, label, options, picked, onToggle, onClear, title,
}: {
  icon: string;
  label: string;
  options: { value: string; label: string }[];
  picked: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  // [#3 2026-07-06] 팝오버 fixed(뷰포트 기준) — 표 헤더·필터바에서 뒤로 숨거나 잘리지 않게(단일 패턴).
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const MENU_W = 176; // w-44
  const toggle = () => {
    setOpen((o) => {
      if (!o) { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ left: Math.min(r.left, window.innerWidth - MENU_W - 8), top: r.bottom + 4 }); }
      return !o;
    });
  };
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button className={`btn btn-sm h-7 px-2 ${picked.size ? "badge-accent" : ""}`} onClick={toggle} title={title ?? `${label} 필터(복수=합집합·빈 선택=전체)`}>
        {icon} {label}{picked.size > 0 && <span className="ml-1 mono">{picked.size}</span>}<span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && pos && (
        <div className="fixed z-[70] w-44 card shadow-lg p-1.5 space-y-0.5" style={{ left: pos.left, top: pos.top }}>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-1.5 h-7 rounded hover:bg-canvas-subtle cursor-pointer text-caption">
              <input type="checkbox" checked={picked.has(o.value)} onChange={() => onToggle(o.value)} />
              <span className="flex-1 truncate">{o.label}</span>
            </label>
          ))}
          {!options.length && <div className="text-micro text-fg-subtle px-1.5 py-2">옵션 없음</div>}
          {picked.size > 0 && <button className="btn btn-sm w-full h-6 text-micro" onClick={onClear}>전체(해제)</button>}
        </div>
      )}
    </div>
  );
}

// ── 체크박스 팝오버(검색 + 다중선택 + 색 스와치) — Lantiv 리소스 드롭다운 ──
export function MultiPick({
  dim, options, picked, onToggle, onClear, onSelectAll,
}: {
  dim: FilterDim;
  options: Option[];
  picked: Set<number>;
  onToggle: (id: number) => void;
  onClear: () => void;
  onSelectAll?: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // [#3 2026-07-06] 팝오버 fixed(뷰포트 기준) — 표 헤더의 overflow/스택에 가려 뒤로 숨는 문제 차단.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const MENU_W = 240; // w-60
  const toggle = () => {
    setOpen((o) => {
      if (!o) { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ left: Math.min(r.left, window.innerWidth - MENU_W - 8), top: r.bottom + 4 }); }
      return !o;
    });
  };
  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.name.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const meta = DIM_META[dim];
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className={`btn btn-sm h-7 min-w-0 max-w-full px-2 ${picked.size ? "badge-accent" : ""}`}
        onClick={toggle}
        title={`${meta.label} 다중선택 — 같은 항목 안은 OR, 다른 필터와는 AND`}
      >
        <span aria-hidden="true">{meta.icon}</span><span className="truncate">{meta.label}</span>
        {picked.size > 0 && <span className="ml-1 mono">{picked.size}</span>}
        <span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && pos && (
        <div
          className="fixed z-[70] card shadow-lg w-60 overflow-hidden"
          style={{ left: pos.left, top: pos.top }}
        >
          <div className="p-2 border-b">
            <input
              className="input h-7 w-full text-caption"
              placeholder={`${meta.label} 검색`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.map((o) => {
              const on = picked.has(o.id);
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-2 px-2 h-8 rounded cursor-pointer text-body ${on ? "bg-neutral-subtle" : "hover:bg-canvas-subtle"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: o.color ?? "var(--color-line)" }} />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.sub && <span className="text-micro text-fg-subtle">{o.sub}</span>}
                </label>
              );
            })}
            {!filtered.length && <div className="text-caption text-fg-subtle text-center py-4">결과 없음</div>}
          </div>
          <div className="flex min-h-8 items-center justify-between gap-2 border-t px-2 py-1 text-caption">
            <span className="text-fg-subtle">
              {picked.size}/{options.length} 선택
            </span>
            <span className="flex items-center gap-1">
              {onSelectAll && (
                <button
                  type="button"
                  className="btn btn-sm h-6 px-1.5"
                  disabled={!filtered.length || filtered.every((option) => picked.has(option.id))}
                  onClick={() => onSelectAll(filtered.map((option) => option.id))}
                >
                  검색 결과 전체 선택
                </button>
              )}
              <button type="button" className="btn btn-sm h-6 px-1.5" disabled={!picked.size} onClick={onClear}>
                선택 해제
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// [v0.1.14] 종류(kind) 필터 어휘 — lib/domain/lantiv 단일 소스 재수출(프리셋·표별 필터와 공유)
