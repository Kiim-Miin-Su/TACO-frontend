"use client";
import { useState } from "react";
import type { ScheduleResources, ScheduleResource } from "@/types";

type RType = "student" | "instructor" | "room";
const TABS: { key: RType; label: string }[] = [
  { key: "instructor", label: "강사" },
  { key: "student", label: "학생" },
  { key: "room", label: "강의실" },
];

// 좌측 자원 레일(Lantiv형): 강사/학생/강의실 목록 → 클릭 시 개인 스케줄로 필터.
export function ResourceRail({
  resources, selected, onSelect, blockCounts,
}: {
  resources: ScheduleResources | null;
  selected: ScheduleResource | null;
  onSelect: (r: ScheduleResource | null) => void;
  blockCounts?: Record<string, number>; // `${type}:${id}` → 불가시간 수(있으면 배지)
}) {
  const [tab, setTab] = useState<RType>("instructor");
  const list: ScheduleResource[] = resources
    ? tab === "instructor" ? resources.instructors : tab === "student" ? resources.students : resources.rooms
    : [];

  return (
    <aside className="w-52 shrink-0 card overflow-hidden self-start sticky top-4">
      <div className="flex border-b" style={{ borderColor: "var(--color-line)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 h-9 text-[12px] font-medium ${tab === t.key ? "text-fg border-b-2 border-accent" : "text-fg-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-[520px] overflow-y-auto p-1.5 space-y-0.5">
        {selected && (
          <button onClick={() => onSelect(null)}
            className="w-full text-left px-2 h-7 rounded text-[12px] text-fg-muted hover:bg-canvas-subtle">
            ← 전체 보기
          </button>
        )}
        {list.map((r) => {
          const active = selected?.type === r.type && selected?.id === r.id;
          const bc = blockCounts?.[`${r.type}:${r.id}`] ?? 0;
          return (
            <button key={`${r.type}-${r.id}`} onClick={() => onSelect(active ? null : r)}
              className={`w-full flex items-center gap-2 px-2 h-9 rounded text-[13px] ${active ? "bg-neutral-subtle font-semibold" : "hover:bg-canvas-subtle text-fg-muted"}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color ?? "var(--color-line)" }} />
              <span className="flex-1 text-left truncate text-fg">{r.name}</span>
              {r.sub && <span className="text-[11px] text-fg-subtle">{r.sub}</span>}
              {bc > 0 && <span className="badge" title="불가시간">{bc}</span>}
            </button>
          );
        })}
        {!list.length && <div className="text-[12px] text-fg-subtle px-2 py-4 text-center">목록 없음</div>}
      </div>
    </aside>
  );
}
