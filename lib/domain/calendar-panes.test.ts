import { describe, expect, it } from "vitest";
import {
  activeCalendarPaneFilterLabels,
  appendCalendarPane,
  calendarPanePeriodLabel,
  calendarPanesFetchRange,
  calendarPanesReducer,
  companionPaneSeed,
  createCalendarPanesState,
  currentPaneSeeds,
  primaryPaneSeed,
} from "./calendar-panes";

describe("calendar pane seed helpers", () => {
  it("moves the current resource filter into the first manual pane", () => {
    expect(primaryPaneSeed({ instructors: [1, 2], students: [10], rooms: [] })).toEqual({
      dim: "instructor",
      ids: [1, 2],
    });
    expect(primaryPaneSeed({ instructors: [], students: [10], rooms: [3] })).toEqual({
      dim: "student",
      ids: [10],
    });
    expect(primaryPaneSeed({ instructors: [], students: [], rooms: [3] })).toEqual({
      dim: "room",
      ids: [3],
    });
  });

  it("uses the logged-in instructor as a concrete fallback owner", () => {
    expect(primaryPaneSeed({ instructors: [], students: [], rooms: [], fallbackInstructorId: 1 })).toEqual({
      dim: "instructor",
      ids: [1],
    });
  });

  it("preserves an unfiltered calendar by seeding the instructors visible on screen", () => {
    expect(currentPaneSeeds({
      instructors: [],
      students: [],
      rooms: [],
      visibleInstructorIds: [2, 2, 4],
    })).toEqual([{ dim: "instructor", ids: [2, 4] }]);
    expect(currentPaneSeeds({
      instructors: [],
      students: [10],
      rooms: [],
      visibleInstructorIds: [2, 4],
    })).toEqual([{ dim: "student", ids: [10] }]);
  });

  it("adds a usable companion pane", () => {
    expect(companionPaneSeed({ dim: "instructor", ids: [1] })).toEqual({ dim: "instructor", ids: [1] });
    expect(companionPaneSeed({ dim: "instructor", ids: [] })).toEqual({ dim: "student", ids: [] });
  });

  it("preserves every active resource dimension when entering manual split mode", () => {
    expect(currentPaneSeeds({ instructors: [1], students: [10, 11], rooms: [3] })).toEqual([
      { dim: "instructor", ids: [1] },
      { dim: "student", ids: [10, 11] },
      { dim: "room", ids: [3] },
    ]);
  });

  it("appends exactly one pane without resetting existing pane state", () => {
    const current = [
      { uid: 1, dim: "instructor" as const, ids: [1] },
      { uid: 2, dim: "student" as const, ids: [10, 11] },
    ];
    const next = appendCalendarPane(current, 3);
    expect(next).toEqual([...current, { uid: 3, dim: "student", ids: [10, 11] }]);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).toBe(current[1]);
  });
});

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

  it("rejects impossible dates at the state boundary", () => {
    expect(() => createCalendarPanesState("2026-02-30")).toThrow(RangeError);
  });
});
