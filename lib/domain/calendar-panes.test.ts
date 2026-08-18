import { describe, expect, it } from "vitest";
import {
  activeCalendarPaneFilterLabels,
  calendarPanePeriodLabel,
  calendarPaneColumnLabel,
  calendarPaneDates,
  calendarRowsForPane,
  calendarPanesFetchRange,
  calendarPanesReducer,
  createCalendarPanesState,
} from "./calendar-panes";
import type { ScheduleRow } from "@/types";

const scheduleRow = (id: number, over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id,
  courseId: 100 + id,
  instructorId: 1,
  instructorName: "David",
  studentIds: [10],
  studentNames: ["Alice"],
  roomId: 3,
  roomName: "A",
  subjectName: "Writing",
  courseName: "Writing",
  sessionDate: "2026-08-18",
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: 60,
  status: "scheduled",
  mode: "in_person",
  ...over,
} as ScheduleRow);

describe("calendar pane state SSOT", () => {
  it("starts with one reusable pane on the requested today date", () => {
    const state = createCalendarPanesState("2026-08-18");
    expect(state).toMatchObject({ activePaneId: "pane-1", nextPaneOrdinal: 2 });
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0].dateSelection).toEqual({
      mode: "range",
      from: "2026-08-18",
      to: "2026-08-18",
      dates: [],
    });
  });

  it("splits by deep-cloning all current conditions and adding exactly one pane", () => {
    let state = createCalendarPanesState("2026-08-18");
    state = calendarPanesReducer(state, {
      type: "pane/set-resource-filter",
      paneId: "pane-1",
      filter: "instructorIds",
      values: [2, 1, 2],
    });
    state = calendarPanesReducer(state, {
      type: "pane/set-status-filter",
      paneId: "pane-1",
      values: ["makeup", "scheduled"],
    });
    const original = state.panes[0];
    const split = calendarPanesReducer(state, { type: "pane/split", paneId: "pane-1" });

    expect(split.panes).toHaveLength(2);
    expect(split.activePaneId).toBe("pane-2");
    expect(split.panes[1]).toEqual({ ...original, id: "pane-2" });
    expect(split.panes[1].filters).not.toBe(original.filters);
    expect(split.panes[1].filters.instructorIds).not.toBe(original.filters.instructorIds);
    expect(split.panes[1].dateSelection).not.toBe(original.dateSelection);
  });

  it("keeps cloned panes independent and preserves untouched pane references", () => {
    const split = calendarPanesReducer(createCalendarPanesState("2026-08-18"), {
      type: "pane/split",
      paneId: "pane-1",
    });
    const next = calendarPanesReducer(split, {
      type: "pane/set-resource-filter",
      paneId: "pane-2",
      filter: "studentIds",
      values: [20, 10],
    });

    expect(next.panes[0]).toBe(split.panes[0]);
    expect(next.panes[0].filters.studentIds).toEqual([]);
    expect(next.panes[1].filters.studentIds).toEqual([10, 20]);
  });

  it("automatically returns 2→1 to the default view without resetting the remaining pane", () => {
    let state = calendarPanesReducer(createCalendarPanesState("2026-08-18"), {
      type: "pane/split",
      paneId: "pane-1",
    });
    state = calendarPanesReducer(state, {
      type: "pane/set-query",
      paneId: "pane-1",
      query: "Writing",
    });
    const remaining = state.panes[0];
    const next = calendarPanesReducer(state, { type: "pane/remove", paneId: "pane-2" });

    expect(next.panes).toEqual([remaining]);
    expect(next.panes[0]).toBe(remaining);
    expect(next.activePaneId).toBe("pane-1");
    expect(calendarPanesReducer(next, { type: "pane/remove", paneId: "pane-1" })).toBe(next);
  });

  it("normalizes reverse drag ranges and keeps range/discrete selection mutually exclusive", () => {
    let state = calendarPanesReducer(createCalendarPanesState("2026-08-18"), {
      type: "pane/set-range",
      paneId: "pane-1",
      anchorDate: "2026-08-22",
      currentDate: "2026-08-19",
    });
    expect(state.panes[0].dateSelection).toEqual({ mode: "range", from: "2026-08-19", to: "2026-08-22", dates: [] });

    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-21" });
    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-18" });
    expect(state.panes[0].dateSelection).toEqual({ mode: "dates", from: null, to: null, dates: ["2026-08-18", "2026-08-21"] });

    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-21" });
    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-18" });
    expect(state.panes[0].dateSelection).toEqual({ mode: "range", from: "2026-08-18", to: "2026-08-18", dates: [] });
  });

  it("reorders panes without changing the active pane identity", () => {
    let state = calendarPanesReducer(createCalendarPanesState("2026-08-18"), { type: "pane/split", paneId: "pane-1" });
    state = calendarPanesReducer(state, { type: "pane/split", paneId: "pane-2" });
    const next = calendarPanesReducer(state, { type: "pane/reorder", paneId: "pane-3", toIndex: 0 });
    expect(next.panes.map((pane) => pane.id)).toEqual(["pane-3", "pane-1", "pane-2"]);
    expect(next.activePaneId).toBe("pane-3");
  });

  it("derives one fetch boundary for all pane periods", () => {
    let state = calendarPanesReducer(createCalendarPanesState("2026-08-18"), { type: "pane/split", paneId: "pane-1" });
    state = calendarPanesReducer(state, {
      type: "pane/set-range",
      paneId: "pane-1",
      anchorDate: "2026-08-20",
      currentDate: "2026-08-24",
    });
    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-2", date: "2026-08-10" });
    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-2", date: "2026-08-28" });
    expect(calendarPanesFetchRange(state)).toEqual({ from: "2026-08-10", to: "2026-08-28" });
  });

  it("returns the same state for unknown targets and normalized no-op filters", () => {
    const state = createCalendarPanesState("2026-08-18");
    expect(calendarPanesReducer(state, { type: "pane/activate", paneId: "missing" })).toBe(state);
    const filtered = calendarPanesReducer(state, {
      type: "pane/set-resource-filter",
      paneId: "pane-1",
      filter: "roomIds",
      values: [3, 1, 3],
    });
    expect(calendarPanesReducer(filtered, {
      type: "pane/set-resource-filter",
      paneId: "pane-1",
      filter: "roomIds",
      values: [1, 3],
    })).toBe(filtered);
  });

  it("produces deterministic period and active-filter labels for the Figma chips", () => {
    let state = createCalendarPanesState("2026-08-18");
    state = calendarPanesReducer(state, {
      type: "pane/set-resource-filter",
      paneId: "pane-1",
      filter: "subjectIds",
      values: [7],
    });
    state = calendarPanesReducer(state, {
      type: "pane/set-mode-filter",
      paneId: "pane-1",
      values: ["online"],
    });
    state = calendarPanesReducer(state, { type: "pane/set-query", paneId: "pane-1", query: "David" });

    expect(calendarPanePeriodLabel(state.panes[0])).toBe("2026-08-18 화요일");
    expect(activeCalendarPaneFilterLabels(state.panes[0], { subject: () => "Writing" })).toEqual([
      "과목: Writing",
      "수업 방식: 비대면",
      "검색: David",
    ]);
  });

  it("derives full ISO date columns for ranges and Ctrl-picked dates", () => {
    let state = calendarPanesReducer(createCalendarPanesState("2026-08-18"), {
      type: "pane/set-range",
      paneId: "pane-1",
      anchorDate: "2026-08-18",
      currentDate: "2026-08-20",
    });
    expect(calendarPaneDates(state.panes[0])).toEqual(["2026-08-18", "2026-08-19", "2026-08-20"]);
    expect(calendarPaneColumnLabel("2026-08-18")).toBe("2026-08-18 (화)");

    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-22" });
    state = calendarPanesReducer(state, { type: "pane/toggle-date", paneId: "pane-1", date: "2026-08-25" });
    expect(calendarPaneDates(state.panes[0])).toEqual(["2026-08-22", "2026-08-25"]);
  });

  it("does not silently truncate a pane range", () => {
    let state = createCalendarPanesState("2026-08-01");
    state = calendarPanesReducer(state, {
      type: "pane/set-range",
      paneId: "pane-1",
      anchorDate: "2026-08-01",
      currentDate: "2026-08-31",
    });

    expect(calendarPaneDates(state.panes[0])).toHaveLength(31);
    expect(calendarPaneDates(state.panes[0], 14)).toHaveLength(14);
  });

  it("filters pane dimensions with AND across axes and OR inside each axis", () => {
    let state = createCalendarPanesState("2026-08-18");
    for (const [filter, values] of [
      ["instructorIds", [1, 2]],
      ["studentIds", [10, 11]],
      ["roomIds", [3]],
      ["subjectIds", [7]],
    ] as const) {
      state = calendarPanesReducer(state, { type: "pane/set-resource-filter", paneId: "pane-1", filter, values: [...values] });
    }
    state = calendarPanesReducer(state, { type: "pane/set-mode-filter", paneId: "pane-1", values: ["online"] });
    const rows = [
      scheduleRow(1, { instructorId: 1, studentIds: [10], roomId: 3, mode: "online" }),
      scheduleRow(2, { instructorId: 2, studentIds: [11], roomId: 3, mode: "online" }),
      scheduleRow(3, { instructorId: 1, studentIds: [99], roomId: 3, mode: "online" }),
      scheduleRow(4, { instructorId: 1, studentIds: [10], roomId: 4, mode: "online" }),
      scheduleRow(5, { instructorId: 1, studentIds: [10], roomId: 3, mode: "in_person" }),
    ];
    expect(calendarRowsForPane(rows, state.panes[0], { subjectIdOf: () => 7 }).map((row) => row.id)).toEqual([1, 2]);
  });

  it("does not guess subject identity when the course resolver is unavailable", () => {
    let state = createCalendarPanesState("2026-08-18");
    state = calendarPanesReducer(state, {
      type: "pane/set-resource-filter",
      paneId: "pane-1",
      filter: "subjectIds",
      values: [7],
    });
    expect(calendarRowsForPane([scheduleRow(1)], state.panes[0])).toEqual([]);
  });

  it("rejects impossible dates at the state boundary", () => {
    expect(() => createCalendarPanesState("2026-02-30")).toThrow(RangeError);
  });
});
