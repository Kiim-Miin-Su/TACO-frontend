import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("[TBO-104 Sprint 1B] CalendarPane runtime convergence", () => {
  it("renders one reusable CalendarPane path for both default and split state", () => {
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(calendar).toContain("calendarPaneModels.map");
    expect(calendar).toContain("<CalendarPane");
    expect(calendar).toContain("paneCount={calendarPaneModels.length}");
    expect(calendar).not.toMatch(/const \[manualPanes|const autoTzPanes|closedPanesRaw|CalendarSplitPane/);
  });

  it("keeps resource changes client-side and fetches one bounding pane range", () => {
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(calendar).toContain("calendarPanesFetchRange(calendarPanesState)");
    expect(calendar).toContain("useCalendarSchedule(paneFetchRange, { keepPreviousData: true })");
    expect(calendar.match(/useCalendarSchedule\(/g)).toHaveLength(1);
    expect(calendar).not.toContain("selQuery");
  });

  it("keeps schedule rows in the bounded Query cache and reuses unchanged pane selections", () => {
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(calendar).toContain("updateScheduleListCache(qc, paneFetchRange, access.scope, update)");
    expect(calendar).toContain("beginScheduleListCacheTransaction(qc, paneFetchRange, access.scope, apply, rollback)");
    expect(calendar).toContain("createCalendarRowsByPaneSelector");
    expect(calendar).toContain("!scheduleQ.isPlaceholderData");
    expect(calendar).not.toMatch(/const \[rows, setRows\] = useState/);
    expect(calendar).not.toMatch(/scheduleQ\.data\) setRows/);
    expect(calendar).toContain("id: --optimisticRowIdRef.current");
    expect(calendar).toContain("const studentIds = (body.studentIds ?? []).map(Number)");
    expect(calendar).not.toContain("id: -Date.now()");
  });

  it("removes legacy top-filter, view-tab and split component files", () => {
    for (const path of [
      "features/calendar/CalendarFilterBar.tsx",
      "features/calendar/CalendarSplitPane.tsx",
      "features/calendar/CalendarPaneFilters.tsx",
      "features/calendar/CalendarViewTabs.tsx",
      "features/calendar/MonthGrid.tsx",
    ]) {
      expect(existsSync(resolve(root, path)), path).toBe(false);
    }
  });

  it("uses the Figma v2 pane controls and full ISO date-column label selector", () => {
    const pane = read("features/calendar/CalendarPane.tsx");
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(pane).toContain("7105:39925");
    expect(pane).toContain("작동 중인 필터");
    expect(calendar).toContain("calendarPaneColumnLabel(date)");
  });
});
