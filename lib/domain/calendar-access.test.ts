import { describe, expect, it } from "vitest";
import type { ScheduleRow } from "@/types";
import { scopeCalendarRowsToInstructor } from "./calendar-access";

const row = (id: number, instructorId: number) => ({ id, instructorId } as ScheduleRow);

describe("calendar instructor scope", () => {
  it("keeps only the JWT instructor's schedule rows", () => {
    expect(scopeCalendarRowsToInstructor([row(1, 1), row(2, 2), row(3, 1)], 1).map((item) => item.id))
      .toEqual([1, 3]);
  });

  it("does not narrow staff rows when no instructor scope exists", () => {
    const rows = [row(1, 1), row(2, 2)];
    expect(scopeCalendarRowsToInstructor(rows)).toBe(rows);
  });
});
