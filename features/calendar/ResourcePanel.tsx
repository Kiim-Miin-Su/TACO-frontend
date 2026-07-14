"use client";
import { memo, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource } from "@/types";

type RType = "instructor" | "student" | "room";
const TABS: { key: RType; label: string }[] = [
  { key: "student", label: "학생" },
  { key: "instructor", label: "강사" },
  { key: "room", label: "강의실" },
];
const DEFAULT_RESOURCE_TYPES: RType[] = ["student", "instructor", "room"];
const PAGE = 8;

// 우측 접이식 패널: 유저별 스케줄 — 강사/학생/강의실을 골라 개인 스케줄로 보기(단일 선택).
// 선택한 학생은 좌측 "학생 → 강사 추천"의 기준이 된다.
// React.memo — 부모(ScheduleCalendar)가 드래그 중 자주 리렌더돼도 props(resources/selected/onSelect)가
// 바뀌지 않으면 이 패널은 리렌더하지 않음(주간 뷰 드래그 성능).
// [UX 제안 2026-07-06] 스플릿 토글 옆 truncate 이름 대신, 이 패널이 "누가 필터돼 있는지"의 단일 확인처.
//  - 필터가 있으면: 선택(필터)된 유저를 리스트 상단에 ✓ 강조로 고정 표시(해제도 클릭 한 번).
//  - 필터가 없으면: 전체 유저(검색 가능 — 기존 그대로). 행 클릭 = **필터 토글**(대표 지시).
//  - 상세 카드(뷰 불변)는 행 우측 ⓘ 버튼으로 분리(기존 onSelect 유지 — 역할 명확화).
function ResourcePanelImpl({
  resources, selected, onSelect, filterIds, onToggleFilter, allowedTypes = DEFAULT_RESOURCE_TYPES,
}: {
  resources: ScheduleResources;
  selected: ScheduleResource | null;
  onSelect: (r: ScheduleResource | null) => void;
  filterIds: Record<RType, Set<number>>;
  onToggleFilter: (dim: RType, id: number) => void;
  allowedTypes?: RType[];
}) {
  const tabs = TABS.filter((item) => allowedTypes.includes(item.key));
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<RType>(allowedTypes[0] ?? "room");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const activeTab = allowedTypes.includes(tab) ? tab : (allowedTypes[0] ?? "room");

  const list: ScheduleResource[] =
    activeTab === "student" ? resources.students : activeTab === "instructor" ? resources.instructors : resources.rooms;
  const picked = filterIds[activeTab]; // 이 탭 차원의 필터 선택(캘린더 필터바와 같은 상태 — 단일 소스)
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = n ? list.filter((x) => x.name.toLowerCase().includes(n)) : list;
    // 필터된 유저를 상단 고정(스플릿에서 "누구를 보고 있는지" 즉시 확인 — UX 제안)
    return picked.size ? [...base].sort((a, b) => Number(picked.has(Number(b.id))) - Number(picked.has(Number(a.id)))) : base;
  }, [list, q, picked]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const changeTab = (k: RType) => { setTab(k); setPage(0); setQ(""); };

  return (
    // 폭·고정(sticky)은 부모 우측 컬럼(ScheduleCalendar)이 담당 — 리스트·상세 패널과 세로 스택
    <aside className="w-full card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 h-10 flex items-center justify-between border-b"
       
      >
        <span className="text-body font-semibold">{tabs.length === 1 && tabs[0]?.key === "room" ? "강의실별 스케줄" : "유저별 스케줄"}{picked.size ? <span className="ml-1.5 badge badge-accent text-[10px]">{picked.size}개 필터</span> : null}</span>
        <span className="text-caption text-fg-subtle inline-flex items-center gap-1">
          {selected ? <span className="text-accent truncate max-w-[90px]">{selected.name}</span> : null}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <>
          {selected && (
            <div className="px-2 pt-2">
              <button
                onClick={() => onSelect(null)}
                className="w-full text-left px-2 h-7 rounded text-caption text-fg-muted hover:bg-canvas-subtle"
              >
                ← 선택 해제 (카드 닫기)
              </button>
            </div>
          )}
          <div className="flex border-b">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={`flex-1 h-9 text-caption font-medium ${activeTab === t.key ? "text-fg border-b-2 border-accent" : "text-fg-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-2">
            <input
              className="input h-8 w-full text-body"
              placeholder={`${tabs.find((t) => t.key === activeTab)?.label} 검색`}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
            />
          </div>
          <div className="px-2 pb-1 space-y-0.5" style={{ minHeight: PAGE * 34 }}>
            {slice.map((r) => {
              const on = selected?.type === r.type && selected?.id === r.id;
              const inFilter = picked.has(Number(r.id));
              return (
                <div
                  key={`${r.type}-${r.id}`}
                  className={`w-full flex items-center gap-1 h-8 rounded text-body ${inFilter ? "bg-neutral-subtle" : on ? "bg-canvas-subtle" : "text-fg-muted"}`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 h-8 px-2 rounded flex items-center gap-2 text-left hover:bg-canvas-subtle"
                    title={inFilter ? "클릭 = 필터에서 제외" : "클릭 = 이 유저로 필터(스플릿·조회 반영)"}
                    aria-pressed={inFilter}
                    onClick={() => onToggleFilter(activeTab, Number(r.id))}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color ?? "var(--color-line)" }} />
                    <span className={`flex-1 text-left truncate text-fg ${inFilter ? "font-semibold" : ""}`}>{r.name}</span>
                    {inFilter && <span className="text-accent text-caption font-bold" aria-label="필터 선택됨">✓</span>}
                    {r.sub && <span className="text-micro text-fg-subtle shrink-0">{r.sub}</span>}
                  </button>
                  <button
                    className={`btn btn-sm h-6 px-1.5 text-micro shrink-0 ${on ? "badge-accent" : ""}`}
                    title="상세 카드 열기(뷰는 그대로)"
                    type="button"
                    onClick={() => onSelect(on ? null : r)}
                  >ⓘ</button>
                </div>
              );
            })}
            {!slice.length && <div className="text-caption text-fg-subtle text-center py-6">결과 없음</div>}
          </div>
          <div className="flex items-center justify-between px-3 h-9 border-t text-caption text-fg-muted">
            <span>{filtered.length}개</span>
            <div className="flex items-center gap-1.5">
              <button className="btn btn-sm h-6 px-1.5" disabled={cur === 0} onClick={() => setPage(cur - 1)}>◀</button>
              <span className="mono">{cur + 1}/{pages}</span>
              <button className="btn btn-sm h-6 px-1.5" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>▶</button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export const ResourcePanel = memo(ResourcePanelImpl);
