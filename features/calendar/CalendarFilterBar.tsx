"use client";
// [참조/처리] Lantiv형 상단 필터 바.
//  - 리소스 다중선택(강사 👓 / 학생 🎓 / 강의실 🚪): 체크박스 팝오버(검색 + 색 스와치) — Lantiv 'Name' 드롭다운 대응.
//  - 상태 필터 4종(출석/지각/결강/보강, lib/domain/lantiv.sessionStates 기준) · "그룹 수업만" · 기간(from/to).
//  - 선택 상태는 부모(ScheduleCalendar)가 소유(단일 소스). 이 컴포넌트는 표시·토글 콜백만 담당(서버 fetch 없음).
//  - 리소스 후보 = GET /schedule/resources(강사·학생) + GET /rooms(강의실) — FK 유니버스와 동일.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Room, ScheduleResources } from "@/types";
import { MAX_SPLIT, STATUS_FILTERS, STATUS_FILTER_LABEL, KIND_FILTERS, KIND_FILTER_LABEL, type StatusFilter, type SessionKindFilter } from "@/lib/domain/lantiv";

export type FilterDim = "instructor" | "student" | "room";
export type ColorBy = "subject" | "instructor" | "room" | "student";
export type Period = { from: string; to: string };

const DIM_META: Record<FilterDim, { icon: string; label: string }> = {
  instructor: { icon: "👓", label: "강사" },
  student: { icon: "🎓", label: "학생" },
  room: { icon: "🚪", label: "강의실" },
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className={`btn btn-sm ${picked.size ? "badge-accent" : ""}`} onClick={() => setOpen((o) => !o)} title={title ?? `${label} 필터(복수=합집합·빈 선택=전체)`}>
        {icon} {label}{picked.size > 0 && <span className="ml-1 mono">{picked.size}</span>}<span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-44 card shadow-lg p-1.5 space-y-0.5">
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
  dim, options, picked, onToggle, onClear,
}: {
  dim: FilterDim;
  options: Option[];
  picked: Set<number>;
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
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
    <div className="relative" ref={ref}>
      <button
        className={`btn btn-sm ${picked.size ? "badge-accent" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={`${meta.label} 다중선택 — 2명 이상 선택하면 스플릿 뷰`}
      >
        {meta.icon} {meta.label}
        {picked.size > 0 && <span className="ml-1 mono">{picked.size}</span>}
        <span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-40 card shadow-lg w-60 overflow-hidden"
         
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
          <div className="flex items-center justify-between px-2 h-8 border-t text-caption">
            <span className="text-fg-subtle">
              {picked.size}/{options.length} 선택
              {picked.size > MAX_SPLIT ? ` · 스플릿은 ${MAX_SPLIT}개까지` : ""}
            </span>
            <button className="btn btn-sm h-6 px-1.5" disabled={!picked.size} onClick={onClear}>
              해제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// [v0.1.14] 종류(kind) 필터 어휘 — lib/domain/lantiv 단일 소스 재수출(프리셋·표별 필터와 공유)
export { KIND_FILTERS, KIND_FILTER_LABEL } from "@/lib/domain/lantiv";
export type { SessionKindFilter } from "@/lib/domain/lantiv";

export function CalendarFilterBar({
  resources, rooms,
  q, onQ, colorBy, onColorBy,
  fInstructors, fStudents, fRooms, onToggleId, onClearDim,
  subjectOptions, fSubjects, onToggleSubject, onClearSubjects,
  fStatuses, onToggleStatus,
  fKinds, onToggleKind,
  groupOnly, onGroupOnly,
  period, onPeriod,
  pickedDates, onPickDate, onUnpickDate, onClearPicked,
  anyFilter, onClearAll,
}: {
  resources: ScheduleResources | null;
  rooms: Room[];
  q: string;
  onQ: (v: string) => void;
  colorBy: ColorBy;
  onColorBy: (v: ColorBy) => void;
  fInstructors: Set<number>;
  fStudents: Set<number>;
  fRooms: Set<number>;
  onToggleId: (dim: FilterDim, id: number) => void;
  onClearDim: (dim: FilterDim) => void;
  subjectOptions: string[];
  fSubjects: Set<string>;
  onToggleSubject: (s: string) => void;
  onClearSubjects: () => void;
  fStatuses: Set<StatusFilter>;
  onToggleStatus: (s: StatusFilter) => void;
  fKinds: Set<SessionKindFilter>;
  onToggleKind: (k: SessionKindFilter) => void;
  groupOnly: boolean;
  onGroupOnly: (v: boolean) => void;
  period: Period | null;
  onPeriod: (p: Period | null) => void;
  pickedDates: string[];
  onPickDate: (d: string) => void;
  onUnpickDate: (d: string) => void;
  onClearPicked: () => void;
  anyFilter: boolean;
  onClearAll: () => void;
}) {
  const optionsOf = (dim: FilterDim): Option[] =>
    dim === "instructor"
      ? (resources?.instructors ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
      : dim === "student"
        ? (resources?.students ?? []).map((r) => ({ id: Number(r.id), name: r.name, color: r.color, sub: r.sub }))
        : rooms.map((r) => ({ id: Number(r.id), name: r.name, color: r.color }));
  const pickedOf = (dim: FilterDim) => (dim === "instructor" ? fInstructors : dim === "student" ? fStudents : fRooms);

  // 선택 칩(이름 역참조 — FK가 리소스 목록에 없으면 #id 폴백, 조인 누락을 숨기지 않음)
  const chips = useMemo(() => {
    const out: { dim: FilterDim; id: number; name: string }[] = [];
    (["instructor", "student", "room"] as FilterDim[]).forEach((dim) => {
      const opts = optionsOf(dim);
      pickedOf(dim).forEach((id) =>
        out.push({ dim, id, name: opts.find((o) => o.id === id)?.name ?? `${DIM_META[dim].label}#${id}` }),
      );
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, rooms, fInstructors, fStudents, fRooms]);

  return (
    <div className="card card-pad space-y-2">
      {/* 1행: 리소스 다중선택 + 상태/그룹 + 기간 */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["instructor", "student", "room"] as FilterDim[]).map((dim) => (
          <MultiPick
            key={dim}
            dim={dim}
            options={optionsOf(dim)}
            picked={pickedOf(dim)}
            onToggle={(id) => onToggleId(dim, id)}
            onClear={() => onClearDim(dim)}
          />
        ))}
        {/* [일관성 2026-07-06] 과목·상태·종류·유형 전부 리소스 팝오버와 같은 문법(버튼+▾+체크) */}
        <OptionPick icon="📚" label="과목" options={subjectOptions.map((s) => ({ value: s, label: s }))} picked={fSubjects} onToggle={onToggleSubject} onClear={onClearSubjects} />
        <OptionPick icon="✅" label="상태" title="출석/지각/결강/보강 (복수=합집합·빈 선택=전체)"
          options={STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_FILTER_LABEL[s] }))}
          picked={fStatuses as unknown as Set<string>} onToggle={(v) => onToggleStatus(v as StatusFilter)}
          onClear={() => STATUS_FILTERS.forEach((s) => fStatuses.has(s) && onToggleStatus(s))} />
        <OptionPick icon="🏷️" label="종류" title="일반/진단고사/상담 (복수=합집합·빈 선택=전체)"
          options={KIND_FILTERS.map((k) => ({ value: k, label: KIND_FILTER_LABEL[k] }))}
          picked={fKinds as unknown as Set<string>} onToggle={(v) => onToggleKind(v as SessionKindFilter)}
          onClear={() => KIND_FILTERS.forEach((k) => fKinds.has(k) && onToggleKind(k))} />
        <OptionPick icon="👥" label="유형" title="그룹 수업만 보기(해제=1:1·그룹 모두)"
          options={[{ value: "group", label: "그룹 수업만(2명 이상)" }]}
          picked={groupOnly ? new Set(["group"]) : new Set()}
          onToggle={() => onGroupOnly(!groupOnly)} onClear={() => onGroupOnly(false)} />
        <span className="w-px h-5 bg-line" />
        {/* 기간: 우측 리스트·조회 범위 확장(뷰 기간 대신 사용) */}
        <label className="flex items-center gap-1 text-caption text-fg-muted">
          기간
          <input
            type="date"
            className="input h-8 w-[130px]"
            value={period?.from ?? ""}
            onChange={(e) => {
              const from = e.target.value;
              if (!from) return onPeriod(null);
              onPeriod({ from, to: period?.to && period.to >= from ? period.to : from });
            }}
          />
          ~
          <input
            type="date"
            className="input h-8 w-[130px]"
            value={period?.to ?? ""}
            min={period?.from}
            onChange={(e) => {
              const to = e.target.value;
              if (!to || !period) return;
              onPeriod({ from: period.from, to: to >= period.from ? to : period.from });
            }}
            disabled={!period}
          />
          {period && (
            <button className="btn btn-sm h-6 px-1.5" onClick={() => onPeriod(null)} title="기간 해제(뷰 기간으로)">
              ✕
            </button>
          )}
        </label>
        {/* [cherry-pick 2026-07-06] 원하는 날짜만 여러 개(불연속·최대 14) — 선택 시 기간보다 우선(표별 헤더와 동일 문법) */}
        <label className="flex items-center gap-1 text-caption text-fg-muted" title="원하는 날짜만 골라 보기 — 고르면 기간(from~to) 대신 이 날짜들만 표시">
          날짜
          <input type="date" className="input h-8 w-[130px]" value="" onChange={(e) => e.target.value && onPickDate(e.target.value)} />
        </label>
        {pickedDates.map((d) => (
          <span key={d} className="badge inline-flex items-center gap-1 mono text-micro cursor-pointer" title="클릭=이 날짜 제거" onClick={() => onUnpickDate(d)}>
            {d.slice(5)} ✕
          </span>
        ))}
        {pickedDates.length > 0 && (
          <button className="btn btn-sm h-6 px-1.5" onClick={onClearPicked} title="선택 날짜 전체 해제">↺</button>
        )}
      </div>
      {/* 2행: 검색 + 색 기준 + 선택 칩 */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="input h-8 w-56"
          placeholder="검색 (수업·강사·강의실·학생·주제)"
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-caption text-fg-muted">
          색 기준
          <select className="input h-8 w-24" value={colorBy} onChange={(e) => onColorBy(e.target.value as ColorBy)}>
            <option value="subject">과목</option>
            <option value="instructor">강사</option>
            <option value="room">강의실</option>
            <option value="student">학생</option>
          </select>
        </label>
        {chips.map((c) => (
          <span key={`${c.dim}${c.id}`} className="badge inline-flex items-center gap-1">
            {DIM_META[c.dim].icon} {c.name}
            <button className="opacity-70 hover:opacity-100" onClick={() => onToggleId(c.dim, c.id)} aria-label="제거">
              ✕
            </button>
          </span>
        ))}
        {anyFilter && (
          <button className="btn btn-sm" onClick={onClearAll}>
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
}
