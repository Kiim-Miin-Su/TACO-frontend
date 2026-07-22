import { describe, expect, it } from "vitest";
import type { ScheduleRow } from "@/types";
import { scopeCalendarRowsToInstructor } from "./calendar-access";
import { matchesCalendarFacetFilters, type StatusFilter } from "./lantiv";

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

  it("과목·상태·수업방식·유형 필터보다 먼저 강사 scope를 고정하고 카테고리 간 AND를 유지한다", () => {
    const rows = [
      { ...row(1, 1), subjectName: "Writing", status: "held", mode: "online", studentIds: [10, 11] },
      { ...row(2, 1), subjectName: "Writing", status: "held", mode: "in_person", studentIds: [10, 11] },
      { ...row(3, 2), subjectName: "Writing", status: "held", mode: "online", studentIds: [10, 11] },
    ] as ScheduleRow[];
    const filters = {
      subjects: new Set(["Writing"]),
      statuses: new Set<StatusFilter>(["attended"]),
      modes: new Set<"online">(["online"]),
      groupOnly: true,
    };
    const visible = scopeCalendarRowsToInstructor(rows, 1)
      .filter((item) => matchesCalendarFacetFilters(item, [], filters));
    expect(visible.map((item) => item.id)).toEqual([1]);
  });
});
