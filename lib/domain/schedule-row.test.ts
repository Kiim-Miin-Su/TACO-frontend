import { describe, expect, it } from "vitest";
import type { ScheduleRow } from "@/types";
import { applyScheduleRowPatch } from "./schedule-row";

const row = (patch: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: 1,
  courseId: 10,
  courseName: "SAT Reading",
  instructorId: 1,
  instructorName: "박지훈",
  sessionDate: "2026-07-13",
  weekday: 1,
  startTime: "23:00",
  durationMinutes: 60,
  status: "scheduled",
  studentIds: [1],
  ...patch,
} as ScheduleRow);

describe("applyScheduleRowPatch", () => {
  it("updates the date and its derived weekday together", () => {
    const next = applyScheduleRowPatch(row(), { sessionDate: "2026-07-15" });
    expect(next.sessionDate).toBe("2026-07-15");
    expect(next.weekday).toBe(3);
  });

  it("keeps cross-midnight sessions duration-based without an invalid endTime", () => {
    const next = applyScheduleRowPatch(row(), { durationMinutes: 120 });
    expect(next.durationMinutes).toBe(120);
    expect(next.endTime).toBeUndefined();
  });

  it("derives duration from a same-day end time", () => {
    const next = applyScheduleRowPatch(row({ startTime: "16:00", endTime: "17:00" }), { endTime: "18:30" });
    expect(next.durationMinutes).toBe(150);
    expect(next.endTime).toBe("18:30");
  });

  it("applies relational and display fields without mutating the source row", () => {
    const source = row({ startTime: "16:00", endTime: "17:00" });
    const next = applyScheduleRowPatch(source, {
      instructorId: 2,
      roomId: 3,
      courseId: 11,
      studentIds: [2, 3],
      topic: "적분 응용",
      mode: "online",
    });
    expect(next).toMatchObject({ instructorId: 2, roomId: 3, courseId: 11, studentIds: [2, 3], topic: "적분 응용", mode: "online" });
    expect(source).toMatchObject({ instructorId: 1, courseId: 10, studentIds: [1] });
  });
});
