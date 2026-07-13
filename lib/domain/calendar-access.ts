import type { ScheduleRow } from "@/types";

export function scopeCalendarRowsToInstructor(rows: ScheduleRow[], instructorId?: number): ScheduleRow[] {
  if (instructorId == null) return rows;
  return rows.filter((row) => Number(row.instructorId) === Number(instructorId));
}
