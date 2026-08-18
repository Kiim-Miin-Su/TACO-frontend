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

  it("loads the global task badge schedule population with one overlapping-range query", () => {
    const queries = read("lib/queries/misc.ts");
    expect(queries.match(/useCalendarSchedule\(/g)).toHaveLength(1);
    expect(queries).toContain("useCalendarSchedule({ from: addDaysISO(today, -31) })");
    expect(queries).not.toMatch(/upcomingSessions|recentSessions/);
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

  // [TBO-104 2A] pane별 memo 렌더 경계 — 1,000세션 실측(sibling commit 42ms·long task ~1.1s) 근거.
  // 시각 입력은 props, 이벤트 핸들러는 ref 경유(stale closure 금지). custom comparator 금지 규칙 유지.
  it("keeps a memoized CalendarTimeGrid boundary with ref-based handlers and identity-cached pane models", () => {
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(calendar).toContain("const CalendarTimeGrid = memo(function CalendarTimeGrid");
    expect(calendar).toContain("handlers.current.onEventDown(");
    expect(calendar).toContain("useLayoutEffect(() => { gridHandlersRef.current = gridHandlers; });");
    expect(calendar).toContain("paneModelCacheRef");
    expect(calendar).toContain("axisValueRef");
    // memo(Component, comparator) 형태의 custom comparator를 이 경계에 붙이지 않는다.
    expect(calendar).not.toContain("arePropsEqual");
    expect(calendar).not.toContain("(prevProps: CalendarTimeGridProps");
    expect(calendar).not.toMatch(/renderTimeGrid\(/);
  });

  // [TBO-104 2A] 우측 5카드 스택 → 단일 CalendarInspector 수렴(Figma 7104:715).
  it("renders one CalendarInspector instead of the five legacy right-column cards", () => {
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    const inspector = read("features/calendar/CalendarInspector.tsx");
    expect(calendar.match(/<CalendarInspector/g)).toHaveLength(1);
    for (const legacy of ["<ResourcePanel", "<ParticipantsCard", "<ResourceDetailCard", "<SessionListPanel", "<SessionDetailPanel"]) {
      expect(calendar, legacy).not.toContain(legacy);
    }
    expect(inspector).toContain("7104:715");
    expect(inspector).toContain("data-calendar-inspector");
    // Inspector는 필터/선택의 사본 상태를 만들지 않는다 — dispatch/부모 콜백만 사용.
    expect(inspector).not.toMatch(/useState<[^>]*ScheduleRow\[\]/);
    expect(inspector).toContain('dispatchPanes({ type: "pane/set-resource-filter"');
  });

  // [TBO-104 1D] 활성 pane 전환으로 헤더 높이가 변하면 pointerdown~pointerup 사이 pane 헤더 버튼이
  // 이동해 첫 클릭(표 삭제/이동/나누기)이 소실된다. 컨테이너 QA에서 40px 이동을 실측해 고정했다.
  it("keeps the page header height stable while the active pane changes", () => {
    const header = read("components/ui/PageHeader.tsx");
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(header).toContain('className="min-w-0 flex-1"');
    expect(calendar).toContain('className="block max-w-full truncate"');
    expect(calendar).toMatch(/title=\{`\$\{calendarPanePeriodLabel\(activeCalendarPane\)\}/);
  });

  it("uses the Figma v2 pane controls and full ISO date-column label selector", () => {
    const pane = read("features/calendar/CalendarPane.tsx");
    const calendar = read("features/calendar/ScheduleCalendar.tsx");
    expect(pane).toContain("7105:39925");
    expect(pane).toContain("작동 중인 필터");
    expect(calendar).toContain("calendarPaneColumnLabel(date)");
  });
});
