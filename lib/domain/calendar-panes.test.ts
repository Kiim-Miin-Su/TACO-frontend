import { describe, expect, it } from "vitest";
import { appendCalendarPane, companionPaneSeed, currentPaneSeeds, primaryPaneSeed } from "./calendar-panes";

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
