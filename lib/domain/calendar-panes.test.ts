import { describe, expect, it } from "vitest";
import { companionPaneSeed, primaryPaneSeed } from "./calendar-panes";

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
});
