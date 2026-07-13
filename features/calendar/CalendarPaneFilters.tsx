"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  MODE_FILTERS,
  MODE_FILTER_LABEL,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  calendarFacetFilterCount,
  emptyCalendarFacetFilters,
  type CalendarFacetFilters,
  type SessionModeFilter,
  type StatusFilter,
} from "@/lib/domain/lantiv";

type FilterCriterion = "subject" | "status" | "mode" | "group";

const CRITERIA: Array<{ value: FilterCriterion; label: string }> = [
  { value: "subject", label: "과목" },
  { value: "status", label: "상태" },
  { value: "mode", label: "방식" },
  { value: "group", label: "구성" },
];

export function CalendarPaneFilters({
  value,
  subjectOptions,
  onChange,
}: {
  value?: CalendarFacetFilters;
  subjectOptions: string[];
  onChange: (next: CalendarFacetFilters) => void;
}) {
  const filters = value ?? emptyCalendarFacetFilters();
  const [open, setOpen] = useState(false);
  const [criterion, setCriterion] = useState<FilterCriterion>("subject");
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const count = calendarFacetFilterCount(filters);

  const positionDialog = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 16);
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280)),
      width,
    });
  }, []);

  const toggle = () => {
    setOpen((current) => {
      if (!current) positionDialog();
      return !current;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionDialog);
    window.addEventListener("scroll", positionDialog, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionDialog);
      window.removeEventListener("scroll", positionDialog, true);
    };
  }, [open, positionDialog]);

  const toggleSubject = (subject: string) => {
    const subjects = new Set(filters.subjects);
    if (subjects.has(subject)) subjects.delete(subject); else subjects.add(subject);
    onChange({ ...filters, subjects });
  };
  const toggleStatus = (status: StatusFilter) => {
    const statuses = new Set(filters.statuses);
    if (statuses.has(status)) statuses.delete(status); else statuses.add(status);
    onChange({ ...filters, statuses });
  };
  const toggleMode = (mode: SessionModeFilter) => {
    const modes = new Set(filters.modes);
    if (modes.has(mode)) modes.delete(mode); else modes.add(mode);
    onChange({ ...filters, modes });
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-sm h-7 max-w-full px-2 ${count ? "badge-accent" : ""}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        title="이 표의 과목, 상태, 수업방식, 그룹 필터"
      >
        <span className="truncate">필터{count ? ` ${count}` : ""}</span>
        <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>
      {open && position && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="표 필터"
          className="fixed z-[80] card shadow-lg overflow-hidden"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: "min(360px, calc(100vh - 16px))" }}
        >
          <div className="grid grid-cols-4 gap-1 p-2 border-b" aria-label="필터 기준">
            {CRITERIA.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`btn btn-sm h-7 min-w-0 px-1 ${criterion === item.value ? "badge-accent" : ""}`}
                aria-pressed={criterion === item.value}
                onClick={() => setCriterion(item.value)}
              >
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {criterion === "subject" && subjectOptions.map((subject) => (
              <FilterOption key={subject} label={subject} checked={filters.subjects.has(subject)} onChange={() => toggleSubject(subject)} />
            ))}
            {criterion === "subject" && !subjectOptions.length && <EmptyOptions />}
            {criterion === "status" && STATUS_FILTERS.map((status) => (
              <FilterOption key={status} label={STATUS_FILTER_LABEL[status]} checked={filters.statuses.has(status)} onChange={() => toggleStatus(status)} />
            ))}
            {criterion === "mode" && MODE_FILTERS.map((mode) => (
              <FilterOption key={mode} label={MODE_FILTER_LABEL[mode]} checked={filters.modes.has(mode)} onChange={() => toggleMode(mode)} />
            ))}
            {criterion === "group" && (
              <FilterOption label="그룹 수업만 (2명 이상)" checked={filters.groupOnly} onChange={() => onChange({ ...filters, groupOnly: !filters.groupOnly })} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t p-2">
            <span className="text-micro text-fg-subtle truncate">적용 {count}개</span>
            <button type="button" className="btn btn-sm h-7" disabled={!count} onClick={() => onChange(emptyCalendarFacetFilters())}>
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded px-2 text-caption hover:bg-canvas-subtle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
    </label>
  );
}

function EmptyOptions() {
  return <div className="px-2 py-4 text-center text-caption text-fg-subtle">옵션 없음</div>;
}
