"use client";

import { useMemo, type ReactNode } from "react";
import type { Room, ScheduleResources } from "@/types";
import {
  activeCalendarPaneFilterLabels,
  calendarPanePeriodLabel,
  calendarPaneTargetLabel,
  type CalendarPaneLabelResolvers,
  type CalendarPaneSort,
  type CalendarPaneState,
  type CalendarPanesAction,
} from "@/lib/domain/calendar-panes";
import {
  MODE_FILTERS,
  MODE_FILTER_LABEL,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  type SessionModeFilter,
  type StatusFilter,
} from "@/lib/domain/lantiv";
import { MultiPick, OptionPick, type FilterDim } from "./CalendarFilterControls";
import { CalendarPaneDateInput } from "./CalendarPaneDateInput";

export type CalendarPaneSubjectOption = { id: number; name: string; color?: string };

// Figma v2 Calendar Pane main component: 7105:39925.

type ResourceOptions = Record<FilterDim, Array<{ id: number; name: string; color?: string; sub?: string }>>;
type ResourceFilterKey = "instructorIds" | "studentIds" | "roomIds" | "subjectIds";

const FILTER_KEY: Record<FilterDim, ResourceFilterKey> = {
  instructor: "instructorIds",
  student: "studentIds",
  room: "roomIds",
  subject: "subjectIds",
};

const ALL_DIMENSIONS: FilterDim[] = ["instructor", "student", "room", "subject"];

export function CalendarPane({
  pane,
  active,
  resources,
  rooms,
  subjects,
  dispatch,
  paneIndex,
  paneCount,
  allowedDimensions = ALL_DIMENSIONS,
  children,
}: {
  pane: CalendarPaneState;
  active: boolean;
  resources: ScheduleResources | null;
  rooms: Room[];
  subjects: CalendarPaneSubjectOption[];
  dispatch: (action: CalendarPanesAction) => void;
  paneIndex: number;
  paneCount: number;
  allowedDimensions?: FilterDim[];
  children: ReactNode;
}) {
  const options = useMemo<ResourceOptions>(() => ({
    instructor: (resources?.instructors ?? []).map((item) => ({ id: Number(item.id), name: item.name, color: item.color, sub: item.sub })),
    student: (resources?.students ?? []).map((item) => ({ id: Number(item.id), name: item.name, color: item.color, sub: item.sub })),
    room: rooms.map((item) => ({ id: Number(item.id), name: item.name, color: item.color })),
    subject: subjects.map((item) => ({ id: Number(item.id), name: item.name, color: item.color })),
  }), [resources, rooms, subjects]);

  const resolvers = useMemo<CalendarPaneLabelResolvers>(() => ({
    instructor: (id) => options.instructor.find((item) => item.id === id)?.name,
    student: (id) => options.student.find((item) => item.id === id)?.name,
    room: (id) => options.room.find((item) => item.id === id)?.name,
    subject: (id) => options.subject.find((item) => item.id === id)?.name,
  }), [options]);
  const activeLabels = activeCalendarPaneFilterLabels(pane, resolvers);

  const setResourceValues = (dim: FilterDim, values: number[]) => {
    dispatch({ type: "pane/set-resource-filter", paneId: pane.id, filter: FILTER_KEY[dim], values });
  };
  const resourceValues = (dim: FilterDim) => pane.filters[FILTER_KEY[dim]];

  return (
    <section
      className={`min-w-0 flex-1 overflow-hidden rounded-lg border bg-canvas ${active ? "border-accent shadow-sm" : "border-line"}`}
      data-calendar-pane={pane.id}
      onPointerDown={() => dispatch({ type: "pane/activate", paneId: pane.id })}
    >
      {/* [2026-08-18 대표 피드백] 필터 드롭다운을 세로로 쌓으니 헤더가 쓸데없이 길어진다 →
          요약 한 줄 + 필터·정렬 도구 한 줄(가로 스크롤)로 압축. 어떤 폭에서도 헤더는 3줄 고정이라
          pane 헤더 높이가 필터 개수·pane 폭에 따라 출렁이지 않는다(첫 클릭 소실 예방 규칙과 동일 계열). */}
      <header className="space-y-1.5 border-b p-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">표 이름</span>
            <input
              className="input h-7 w-full min-w-0 font-semibold"
              placeholder="표 이름"
              value={pane.label}
              onChange={(event) => dispatch({ type: "pane/set-label", paneId: pane.id, label: event.target.value })}
            />
          </label>
          <button type="button" className="btn btn-sm h-7 shrink-0" onClick={() => dispatch({ type: "pane/split", paneId: pane.id })}>⊞ 표 나누기</button>
          {paneIndex > 0 && <button type="button" className="btn btn-sm h-7 w-7 shrink-0 p-0" aria-label="표를 왼쪽으로 이동" onClick={() => dispatch({ type: "pane/reorder", paneId: pane.id, toIndex: paneIndex - 1 })}>←</button>}
          {paneIndex < paneCount - 1 && <button type="button" className="btn btn-sm h-7 w-7 shrink-0 p-0" aria-label="표를 오른쪽으로 이동" onClick={() => dispatch({ type: "pane/reorder", paneId: pane.id, toIndex: paneIndex + 1 })}>→</button>}
          {paneCount > 1 && <button type="button" className="btn btn-sm h-7 w-7 shrink-0 p-0" aria-label="표 삭제" onClick={() => dispatch({ type: "pane/remove", paneId: pane.id })}>✕</button>}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 text-caption">
          <span className="badge shrink-0 max-w-[240px] truncate" title={calendarPaneTargetLabel(pane, resolvers)}>대상: {calendarPaneTargetLabel(pane, resolvers)}</span>
          <span className="badge shrink-0 max-w-[280px] truncate" title={calendarPanePeriodLabel(pane)}>기간: {calendarPanePeriodLabel(pane)}</span>
          {activeLabels.length > 0 && (
            <span className="flex shrink-0 items-center gap-1" aria-label="작동 중인 필터">
              <span className="text-micro font-semibold text-fg-muted">작동 중</span>
              {activeLabels.map((label) => <span key={label} className="badge max-w-[180px] truncate text-micro" title={label}>{label}</span>)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
          {allowedDimensions.map((dim) => {
            const values = resourceValues(dim);
            const picked = new Set(values);
            return (
              <MultiPick
                key={dim}
                dim={dim}
                options={options[dim]}
                picked={picked}
                onToggle={(id) => setResourceValues(dim, picked.has(id) ? values.filter((value) => value !== id) : [...values, id])}
                onClear={() => setResourceValues(dim, [])}
                onSelectAll={(ids) => setResourceValues(dim, [...values, ...ids])}
              />
            );
          })}
          <OptionPick
            icon="✅"
            label="상태"
            options={STATUS_FILTERS.map((status) => ({ value: status, label: STATUS_FILTER_LABEL[status] }))}
            picked={new Set(pane.filters.statuses)}
            onToggle={(value) => {
              const status = value as StatusFilter;
              dispatch({
                type: "pane/set-status-filter",
                paneId: pane.id,
                values: pane.filters.statuses.includes(status)
                  ? pane.filters.statuses.filter((item) => item !== status)
                  : [...pane.filters.statuses, status],
              });
            }}
            onClear={() => dispatch({ type: "pane/set-status-filter", paneId: pane.id, values: [] })}
          />
          <OptionPick
            icon="🖥️"
            label="수업 방식"
            options={MODE_FILTERS.map((mode) => ({ value: mode, label: MODE_FILTER_LABEL[mode] }))}
            picked={new Set(pane.filters.modes)}
            onToggle={(value) => {
              const mode = value as SessionModeFilter;
              dispatch({
                type: "pane/set-mode-filter",
                paneId: pane.id,
                values: pane.filters.modes.includes(mode)
                  ? pane.filters.modes.filter((item) => item !== mode)
                  : [...pane.filters.modes, mode],
              });
            }}
            onClear={() => dispatch({ type: "pane/set-mode-filter", paneId: pane.id, values: [] })}
          />
          <CalendarPaneDateInput
            pane={pane}
            onSetRange={(anchorDate, currentDate) => dispatch({ type: "pane/set-range", paneId: pane.id, anchorDate, currentDate })}
            onToggleDate={(date) => dispatch({ type: "pane/toggle-date", paneId: pane.id, date })}
          />
          <input
            type="search"
            className="input h-7 w-[150px] shrink-0"
            placeholder="과목·강사·학생·강의실 검색"
            value={pane.filters.query}
            onChange={(event) => dispatch({ type: "pane/set-query", paneId: pane.id, query: event.target.value })}
          />
          <select
            className="input h-7 w-[92px] shrink-0 text-caption"
            value={pane.sort.field}
            aria-label="정렬 기준"
            onChange={(event) => dispatch({ type: "pane/set-sort", paneId: pane.id, sort: { ...pane.sort, field: event.target.value as CalendarPaneSort["field"] } })}
          >
            <option value="date">기간</option>
            <option value="subject">과목</option>
            <option value="instructor">강사명</option>
            <option value="student">학생명</option>
          </select>
          <button
            type="button"
            className="btn btn-sm h-7 shrink-0"
            aria-label={pane.sort.direction === "asc" ? "오름차순 (클릭하여 내림차순)" : "내림차순 (클릭하여 오름차순)"}
            onClick={() => dispatch({ type: "pane/set-sort", paneId: pane.id, sort: { ...pane.sort, direction: pane.sort.direction === "asc" ? "desc" : "asc" } })}
          >
            {pane.sort.direction === "asc" ? "오름차순 ↑" : "내림차순 ↓"}
          </button>
        </div>
      </header>
      <div className="min-h-[240px] min-w-0 overflow-hidden">{children}</div>
    </section>
  );
}
