import type { Attendance, ScheduleRow } from "@/types";
import { addDaysISO, todayKst } from "../format";
import { WEEKDAYS_KO, weekdayOf } from "./schedule";
import {
  matchesCalendarFacetFilters,
  MODE_FILTER_LABEL,
  sortByDateAsc,
  STATUS_FILTER_LABEL,
  type SessionModeFilter,
  type StatusFilter,
} from "./lantiv";

// ── [TBO-104 Sprint 1A] Figma Calendar Pane(7084:2) 상태 정본 ────────────────
// 화면 분할 여부는 별도 모드가 아니라 panes 개수로만 표현한다. 따라서 기본뷰(1개)와
// 분할뷰(N개)가 같은 컴포넌트·상태·전이 규칙을 사용하고, 2→1 삭제 시에도 남은 필터가 유지된다.

export type CalendarPaneDateSelection =
  | { mode: "range"; from: string; to: string; dates: [] }
  | { mode: "dates"; from: null; to: null; dates: string[] };

export type CalendarPaneFilters = {
  instructorIds: number[];
  studentIds: number[];
  roomIds: number[];
  subjectIds: number[];
  statuses: StatusFilter[];
  modes: SessionModeFilter[];
  query: string;
};

export type CalendarPaneSort = {
  field: "subject" | "instructor" | "student" | "date";
  direction: "asc" | "desc";
};

export type CalendarPaneState = {
  id: string;
  label: string;
  dateSelection: CalendarPaneDateSelection;
  filters: CalendarPaneFilters;
  sort: CalendarPaneSort;
};

export type CalendarPanesState = {
  panes: CalendarPaneState[];
  activePaneId: string;
  nextPaneOrdinal: number;
};

type ResourceFilterKey = "instructorIds" | "studentIds" | "roomIds" | "subjectIds";

export type CalendarPanesAction =
  | { type: "pane/activate"; paneId: string }
  | { type: "pane/split"; paneId: string }
  | { type: "pane/remove"; paneId: string }
  | { type: "pane/reorder"; paneId: string; toIndex: number }
  | { type: "pane/set-label"; paneId: string; label: string }
  | { type: "pane/set-resource-filter"; paneId: string; filter: ResourceFilterKey; values: number[] }
  | { type: "pane/set-status-filter"; paneId: string; values: StatusFilter[] }
  | { type: "pane/set-mode-filter"; paneId: string; values: SessionModeFilter[] }
  | { type: "pane/set-query"; paneId: string; query: string }
  | { type: "pane/set-range"; paneId: string; anchorDate: string; currentDate: string }
  | { type: "pane/toggle-date"; paneId: string; date: string }
  | { type: "pane/set-sort"; paneId: string; sort: CalendarPaneSort };

export type CalendarPaneLabelResolvers = Partial<{
  instructor: (id: number) => string | undefined;
  student: (id: number) => string | undefined;
  room: (id: number) => string | undefined;
  subject: (id: number) => string | undefined;
}>;

const emptyPaneFilters = (): CalendarPaneFilters => ({
  instructorIds: [],
  studentIds: [],
  roomIds: [],
  subjectIds: [],
  statuses: [],
  modes: [],
  query: "",
});

export function createCalendarPane(date = todayKst(), id = "pane-1"): CalendarPaneState {
  assertIsoDate(date);
  return {
    id,
    label: "",
    dateSelection: { mode: "range", from: date, to: date, dates: [] },
    filters: emptyPaneFilters(),
    sort: { field: "date", direction: "asc" },
  };
}

export function createCalendarPanesState(date = todayKst()): CalendarPanesState {
  return { panes: [createCalendarPane(date)], activePaneId: "pane-1", nextPaneOrdinal: 2 };
}

const sameArray = <T>(left: readonly T[], right: readonly T[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const normalizeIds = (values: readonly number[]): number[] =>
  [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);

const normalizeStrings = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)].sort() as T[];

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Date must be YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Date must be a valid calendar date");
  }
}

function replacePane(
  state: CalendarPanesState,
  paneId: string,
  update: (pane: CalendarPaneState) => CalendarPaneState,
): CalendarPanesState {
  const index = state.panes.findIndex((pane) => pane.id === paneId);
  if (index < 0) return state;
  const pane = update(state.panes[index]);
  if (pane === state.panes[index]) return state;
  const panes = [...state.panes];
  panes[index] = pane;
  return { ...state, panes };
}

function clonePane(source: CalendarPaneState, id: string): CalendarPaneState {
  return {
    ...source,
    id,
    dateSelection: source.dateSelection.mode === "range"
      ? { ...source.dateSelection, dates: [] }
      : { ...source.dateSelection, dates: [...source.dateSelection.dates] },
    filters: {
      ...source.filters,
      instructorIds: [...source.filters.instructorIds],
      studentIds: [...source.filters.studentIds],
      roomIds: [...source.filters.roomIds],
      subjectIds: [...source.filters.subjectIds],
      statuses: [...source.filters.statuses],
      modes: [...source.filters.modes],
    },
    sort: { ...source.sort },
  };
}

export function calendarPanesReducer(state: CalendarPanesState, action: CalendarPanesAction): CalendarPanesState {
  switch (action.type) {
    case "pane/activate":
      if (state.activePaneId === action.paneId || !state.panes.some((pane) => pane.id === action.paneId)) return state;
      return { ...state, activePaneId: action.paneId };
    case "pane/split": { // 현재 조건을 그대로 복제하고 정확히 한 pane만 추가한다.
      const index = state.panes.findIndex((pane) => pane.id === action.paneId);
      if (index < 0) return state;
      const id = `pane-${state.nextPaneOrdinal}`;
      const panes = [...state.panes];
      panes.splice(index + 1, 0, clonePane(state.panes[index], id));
      return { panes, activePaneId: id, nextPaneOrdinal: state.nextPaneOrdinal + 1 };
    }
    case "pane/remove": { // 최소 1개 보장: 2→1은 기본뷰로 자동 전이된다.
      if (state.panes.length === 1) return state;
      const index = state.panes.findIndex((pane) => pane.id === action.paneId);
      if (index < 0) return state;
      const panes = state.panes.filter((pane) => pane.id !== action.paneId);
      const activePaneId = state.activePaneId === action.paneId
        ? panes[Math.min(index, panes.length - 1)].id
        : state.activePaneId;
      return { ...state, panes, activePaneId };
    }
    case "pane/reorder": {
      const fromIndex = state.panes.findIndex((pane) => pane.id === action.paneId);
      if (fromIndex < 0) return state;
      const toIndex = Math.max(0, Math.min(action.toIndex, state.panes.length - 1));
      if (fromIndex === toIndex) return state;
      const panes = [...state.panes];
      const [pane] = panes.splice(fromIndex, 1);
      panes.splice(toIndex, 0, pane);
      return { ...state, panes };
    }
    case "pane/set-label":
      return replacePane(state, action.paneId, (pane) => {
        const label = action.label.trim();
        return pane.label === label ? pane : { ...pane, label };
      });
    case "pane/set-resource-filter":
      return replacePane(state, action.paneId, (pane) => {
        const values = normalizeIds(action.values);
        return sameArray(pane.filters[action.filter], values)
          ? pane
          : { ...pane, filters: { ...pane.filters, [action.filter]: values } };
      });
    case "pane/set-status-filter":
      return replacePane(state, action.paneId, (pane) => {
        const statuses = normalizeStrings(action.values);
        return sameArray(pane.filters.statuses, statuses)
          ? pane
          : { ...pane, filters: { ...pane.filters, statuses } };
      });
    case "pane/set-mode-filter":
      return replacePane(state, action.paneId, (pane) => {
        const modes = normalizeStrings(action.values);
        return sameArray(pane.filters.modes, modes)
          ? pane
          : { ...pane, filters: { ...pane.filters, modes } };
      });
    case "pane/set-query":
      return replacePane(state, action.paneId, (pane) => {
        const query = action.query.trimStart();
        return pane.filters.query === query ? pane : { ...pane, filters: { ...pane.filters, query } };
      });
    case "pane/set-range": {
      assertIsoDate(action.anchorDate);
      assertIsoDate(action.currentDate);
      const [from, to] = action.anchorDate <= action.currentDate
        ? [action.anchorDate, action.currentDate]
        : [action.currentDate, action.anchorDate];
      return replacePane(state, action.paneId, (pane) => pane.dateSelection.mode === "range"
        && pane.dateSelection.from === from && pane.dateSelection.to === to
        ? pane
        : { ...pane, dateSelection: { mode: "range", from, to, dates: [] } });
    }
    case "pane/toggle-date": {
      assertIsoDate(action.date);
      return replacePane(state, action.paneId, (pane) => {
        // Ctrl/Cmd selection starts from what the user can already see. Converting a
        // range to only the clicked date made the default "today + Ctrl-click" flow
        // silently discard today, so expand the range before toggling one date.
        const currentDates = pane.dateSelection.mode === "range"
          ? calendarPaneDates(pane)
          : pane.dateSelection.dates;
        const selected = currentDates.includes(action.date);
        if (selected && currentDates.length === 1) return pane; // at least one visible day
        const dates = selected
          ? currentDates.filter((date) => date !== action.date)
          : normalizeStrings([...currentDates, action.date]);
        return { ...pane, dateSelection: { mode: "dates", from: null, to: null, dates } };
      });
    }
    case "pane/set-sort":
      return replacePane(state, action.paneId, (pane) => pane.sort.field === action.sort.field
        && pane.sort.direction === action.sort.direction
        ? pane
        : { ...pane, sort: { ...action.sort } });
  }
}

/** 모든 pane의 합집합 조회 경계. UI는 이 범위로 한 번 fetch하고 pane별 교집합 필터를 적용한다. */
export function calendarPanesFetchRange(state: CalendarPanesState): { from: string; to: string } {
  const boundaries = state.panes.flatMap((pane) => pane.dateSelection.mode === "range"
    ? [pane.dateSelection.from, pane.dateSelection.to]
    : [pane.dateSelection.dates[0], pane.dateSelection.dates.at(-1)!]);
  return { from: boundaries.reduce((min, date) => date < min ? date : min), to: boundaries.reduce((max, date) => date > max ? date : max) };
}

const dateWithWeekday = (date: string) => `${date} ${WEEKDAYS_KO[weekdayOf(date)]}요일`;

/** Figma Date Column header SSOT. Every visible column renders its full ISO date. */
export const calendarPaneColumnLabel = (date: string) => `${date} (${WEEKDAYS_KO[weekdayOf(date)]})`;

/**
 * Pane date axis. Range and Ctrl/Cmd-picked dates stay mutually exclusive in the reducer.
 *
 * This selector never truncates implicitly. Fetch, labels and visible columns must describe
 * the same population; preview callers may pass an explicit limit and own its overflow UI.
 */
export function calendarPaneDates(pane: CalendarPaneState, limit?: number): string[] {
  if (pane.dateSelection.mode === "dates") {
    return limit == null ? [...pane.dateSelection.dates] : pane.dateSelection.dates.slice(0, limit);
  }
  const dates: string[] = [];
  for (
    let date = pane.dateSelection.from;
    date <= pane.dateSelection.to && (limit == null || dates.length < limit);
    date = addDaysISO(date, 1)
  ) {
    dates.push(date);
  }
  return dates;
}

export type CalendarPaneRowContext = {
  attendanceBySession?: ReadonlyMap<number, Attendance[]>;
  subjectIdOf?: (courseId: number) => number | undefined;
};

const includesAny = (selected: readonly number[], values: readonly number[]) =>
  selected.length === 0 || values.some((value) => selected.includes(Number(value)));

const rowSortValue = (row: ScheduleRow, field: CalendarPaneSort["field"]): string => {
  if (field === "subject") return row.subjectName ?? row.courseName ?? "";
  if (field === "instructor") return row.instructorName ?? "";
  if (field === "student") return [...(row.studentNames ?? [])].sort().join(", ");
  return `${row.sessionDate}T${row.startTime ?? "00:00"}`;
};

/**
 * Calendar pane row selector SSOT.
 * - dimensions are intersected (AND)
 * - multiple values inside one dimension are unioned (OR)
 * - subjectId is resolved from the current course projection until Course cutover is complete
 */
export function calendarRowsForPane(
  rows: readonly ScheduleRow[],
  pane: CalendarPaneState,
  context: CalendarPaneRowContext = {},
): ScheduleRow[] {
  const dates = new Set(calendarPaneDates(pane));
  const query = pane.filters.query.trim().toLocaleLowerCase("ko-KR");
  const facetFilters = {
    subjects: new Set<string>(),
    statuses: new Set(pane.filters.statuses),
    modes: new Set(pane.filters.modes),
    groupOnly: false,
  };
  const selected = rows.filter((row) => {
    if (!dates.has(row.sessionDate)) return false;
    if (pane.filters.instructorIds.length && !pane.filters.instructorIds.includes(Number(row.instructorId))) return false;
    if (!includesAny(pane.filters.studentIds, row.studentIds ?? [])) return false;
    if (pane.filters.roomIds.length && (row.roomId == null || !pane.filters.roomIds.includes(Number(row.roomId)))) return false;
    if (pane.filters.subjectIds.length) {
      const subjectId = context.subjectIdOf?.(Number(row.courseId));
      if (subjectId == null || !pane.filters.subjectIds.includes(subjectId)) return false;
    }
    if (!matchesCalendarFacetFilters(
      row,
      context.attendanceBySession?.get(Number(row.id)) ?? [],
      facetFilters,
    )) return false;
    if (query) {
      const haystack = [
        row.subjectName,
        row.courseName,
        row.instructorName,
        row.roomName,
        ...(row.studentNames ?? []),
        row.topic,
        row.memo,
        row.status,
        row.mode,
      ].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  if (pane.sort.field === "date") {
    const sorted = sortByDateAsc([...selected]);
    return pane.sort.direction === "asc" ? sorted : sorted.reverse();
  }
  const direction = pane.sort.direction === "asc" ? 1 : -1;
  return [...selected].sort((left, right) => {
    const compared = rowSortValue(left, pane.sort.field).localeCompare(rowSortValue(right, pane.sort.field), "ko");
    return compared === 0 ? (Number(left.id) - Number(right.id)) * direction : compared * direction;
  });
}

/**
 * Incremental pane selector. Reducer actions preserve unchanged pane object identity, so a filter
 * edit in one pane only rescans rows for that pane while siblings reuse their prior result arrays.
 * A server row, attendance or course→subject projection change intentionally invalidates all panes.
 */
export function createCalendarRowsByPaneSelector() {
  let previous: {
    rows: readonly ScheduleRow[];
    attendanceBySession: CalendarPaneRowContext["attendanceBySession"];
    subjectIdOf: CalendarPaneRowContext["subjectIdOf"];
    entries: Map<string, {
      dateSelection: CalendarPaneDateSelection;
      filters: CalendarPaneFilters;
      sort: CalendarPaneSort;
      rows: ScheduleRow[];
    }>;
  } | null = null;

  return (
    rows: readonly ScheduleRow[],
    panes: readonly CalendarPaneState[],
    context: CalendarPaneRowContext = {},
  ): Map<string, ScheduleRow[]> => {
    const canReuse = previous?.rows === rows
      && previous.attendanceBySession === context.attendanceBySession
      && previous.subjectIdOf === context.subjectIdOf;
    const entries = new Map<string, {
      dateSelection: CalendarPaneDateSelection;
      filters: CalendarPaneFilters;
      sort: CalendarPaneSort;
      rows: ScheduleRow[];
    }>();
    const rowsByPane = new Map<string, ScheduleRow[]>();

    for (const pane of panes) {
      const cached = canReuse ? previous?.entries.get(pane.id) : undefined;
      const selected = cached?.dateSelection === pane.dateSelection
        && cached.filters === pane.filters
        && cached.sort === pane.sort
        ? cached.rows
        : calendarRowsForPane(rows, pane, context);
      entries.set(pane.id, {
        dateSelection: pane.dateSelection,
        filters: pane.filters,
        sort: pane.sort,
        rows: selected,
      });
      rowsByPane.set(pane.id, selected);
    }
    previous = {
      rows,
      attendanceBySession: context.attendanceBySession,
      subjectIdOf: context.subjectIdOf,
      entries,
    };
    return rowsByPane;
  };
}

export function calendarPanePeriodLabel(pane: CalendarPaneState): string {
  if (pane.dateSelection.mode === "range") {
    return pane.dateSelection.from === pane.dateSelection.to
      ? dateWithWeekday(pane.dateSelection.from)
      : `${dateWithWeekday(pane.dateSelection.from)} ~ ${dateWithWeekday(pane.dateSelection.to)}`;
  }
  const dates = pane.dateSelection.dates;
  return dates.length <= 3
    ? dates.map(dateWithWeekday).join(", ")
    : `${dateWithWeekday(dates[0])} 외 ${dates.length - 1}일`;
}

function resourceLabel(
  noun: string,
  ids: readonly number[],
  resolve?: (id: number) => string | undefined,
  counter = "명",
): string | undefined {
  if (!ids.length) return undefined;
  const names = resolve ? ids.map(resolve).filter((name): name is string => Boolean(name)) : [];
  return names.length === ids.length ? `${noun}: ${names.join(", ")}` : `${noun} ${ids.length}${counter}`;
}

export function calendarPaneTargetLabel(pane: CalendarPaneState, resolvers: CalendarPaneLabelResolvers = {}): string {
  return [
    resourceLabel("강사", pane.filters.instructorIds, resolvers.instructor),
    resourceLabel("학생", pane.filters.studentIds, resolvers.student),
    resourceLabel("강의실", pane.filters.roomIds, resolvers.room, "개"),
  ].filter((label): label is string => Boolean(label)).join(" · ") || "전체 대상";
}

/** Figma Filter Chip(7081:29)에 바로 매핑되는 작동 중 필터 라벨. */
export function activeCalendarPaneFilterLabels(
  pane: CalendarPaneState,
  resolvers: CalendarPaneLabelResolvers = {},
): string[] {
  const subjects = resourceLabel("과목", pane.filters.subjectIds, resolvers.subject, "개");
  return [
    resourceLabel("강사", pane.filters.instructorIds, resolvers.instructor),
    resourceLabel("학생", pane.filters.studentIds, resolvers.student),
    resourceLabel("강의실", pane.filters.roomIds, resolvers.room, "개"),
    subjects,
    pane.filters.statuses.length ? `상태: ${pane.filters.statuses.map((status) => STATUS_FILTER_LABEL[status]).join(", ")}` : undefined,
    pane.filters.modes.length ? `수업 방식: ${pane.filters.modes.map((mode) => MODE_FILTER_LABEL[mode]).join(", ")}` : undefined,
    pane.filters.query.trim() ? `검색: ${pane.filters.query.trim()}` : undefined,
  ].filter((label): label is string => Boolean(label));
}
