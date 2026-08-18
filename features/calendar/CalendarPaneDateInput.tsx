"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarPaneDateSelection } from "@/lib/domain/calendar-panes";
import { calendarPanePeriodLabel, type CalendarPaneState } from "@/lib/domain/calendar-panes";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const pad = (value: number) => String(value).padStart(2, "0");

function initialMonth(value: CalendarPaneDateSelection): string {
  return (value.mode === "range" ? value.from : value.dates[0]).slice(0, 7);
}

function moveMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

function monthCells(month: string): Array<string | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= lastDay; day += 1) cells.push(`${month}-${pad(day)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function isSelected(value: CalendarPaneDateSelection, date: string): boolean {
  if (value.mode === "dates") return value.dates.includes(date);
  return value.from <= date && date <= value.to;
}

export function CalendarPaneDateInput({
  pane,
  onSetRange,
  onToggleDate,
}: {
  pane: CalendarPaneState;
  onSetRange: (anchorDate: string, currentDate: string) => void;
  onToggleDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => initialMonth(pane.dateSelection));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragDraft, setDragDraft] = useState<{ anchor: string; current: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragDraftRef = useRef<{ anchor: string; current: string } | null>(null);
  const cells = useMemo(() => monthCells(month), [month]);
  const selectionStart = pane.dateSelection.mode === "range" ? pane.dateSelection.from : pane.dateSelection.dates[0];
  const visibleSelection: CalendarPaneDateSelection = dragDraft
    ? {
        mode: "range",
        from: dragDraft.anchor <= dragDraft.current ? dragDraft.anchor : dragDraft.current,
        to: dragDraft.anchor <= dragDraft.current ? dragDraft.current : dragDraft.anchor,
        dates: [],
      }
    : pane.dateSelection;

  useEffect(() => setMonth(selectionStart.slice(0, 7)), [selectionStart]);

  const positionDialog = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 312)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 344)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const stopDrag = () => {
      const draft = dragDraftRef.current;
      dragDraftRef.current = null;
      setDragDraft(null);
      if (draft) onSetRange(draft.anchor, draft.current);
    };
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionDialog);
    window.addEventListener("scroll", positionDialog, true);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionDialog);
      window.removeEventListener("scroll", positionDialog, true);
    };
  }, [open, onSetRange, positionDialog]);

  const selectStart = (event: ReactPointerEvent<HTMLButtonElement>, date: string) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      onToggleDate(date);
      dragDraftRef.current = null;
      setDragDraft(null);
      return;
    }
    const draft = { anchor: date, current: date };
    dragDraftRef.current = draft;
    setDragDraft(draft);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="input flex h-7 w-auto max-w-[200px] items-center justify-between gap-2 px-2 text-left text-caption"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => {
          if (!current) positionDialog();
          return !current;
        })}
        title="드래그로 기간 선택 · Ctrl/Cmd+클릭으로 원하는 날짜만 선택"
      >
        <span className="min-w-0 flex-1 truncate">{calendarPanePeriodLabel(pane)}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && position && (
        <div
          role="dialog"
          aria-label={`${pane.label || "캘린더 표"} 기간 선택`}
          className="fixed z-[90] w-[304px] rounded-lg border bg-canvas p-3 shadow-lg"
          style={position}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" className="btn btn-sm h-7 w-7 p-0" onClick={() => setMonth((value) => moveMonth(value, -1))} aria-label="이전 달">←</button>
            <strong className="text-body">{month.replace("-", "년 ")}월</strong>
            <button type="button" className="btn btn-sm h-7 w-7 p-0" onClick={() => setMonth((value) => moveMonth(value, 1))} aria-label="다음 달">→</button>
          </div>
          <div className="grid grid-cols-7 gap-1" aria-label="요일">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="grid h-6 place-items-center text-micro text-fg-subtle">{weekday}</span>
            ))}
            {cells.map((date, index) => date ? (
              <button
                key={date}
                type="button"
                className={`grid h-8 place-items-center rounded text-caption ${isSelected(visibleSelection, date) ? "bg-accent text-white" : "hover:bg-canvas-subtle"}`}
                aria-pressed={isSelected(visibleSelection, date)}
                aria-label={date}
                onPointerDown={(event) => selectStart(event, date)}
                onPointerEnter={(event) => {
                  const draft = dragDraftRef.current;
                  if (!draft || event.buttons !== 1) return;
                  const next = { ...draft, current: date };
                  dragDraftRef.current = next;
                  setDragDraft(next);
                }}
                onClick={(event) => event.preventDefault()}
              >
                {Number(date.slice(-2))}
              </button>
            ) : <span key={`blank-${index}`} aria-hidden="true" />)}
          </div>
          <p className="mt-2 text-micro text-fg-subtle">드래그: 연속 기간 · Ctrl/Cmd+클릭: 개별 날짜</p>
        </div>
      )}
    </div>
  );
}
