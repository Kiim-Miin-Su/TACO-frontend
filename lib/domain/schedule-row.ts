import type { SchedulePatchBody } from "@/lib/api";
import type { ScheduleRow } from "@/types";
import { durationMinutesBetween, fromMin, toMin, weekdayOf } from "./schedule";

/**
 * Apply a server schedule patch to a read-model row for optimistic rendering
 * and approval-request previews. The backend remains authoritative.
 */
export function applyScheduleRowPatch(row: ScheduleRow, patch: SchedulePatchBody): ScheduleRow {
  const next: ScheduleRow = { ...row };
  if (patch.sessionDate) {
    next.sessionDate = patch.sessionDate;
    next.weekday = weekdayOf(patch.sessionDate);
  }
  if (patch.startTime) next.startTime = patch.startTime;
  if (patch.endTime) next.endTime = patch.endTime;
  if (patch.startTime || patch.endTime) {
    const start = toMin(next.startTime ?? "00:00");
    const end = next.endTime
      ? start + durationMinutesBetween(next.startTime ?? "00:00", next.endTime)
      : start + next.durationMinutes;
    next.durationMinutes = Math.max(1, end - start);
    if (end >= 1440) next.endTime = undefined;
  }
  if (patch.durationMinutes != null) {
    next.durationMinutes = patch.durationMinutes;
    if (next.startTime && !patch.endTime) {
      const end = toMin(next.startTime) + patch.durationMinutes;
      next.endTime = end >= 1440 ? undefined : fromMin(end);
    }
  }
  if (patch.roomId !== undefined) next.roomId = patch.roomId;
  if (patch.instructorId !== undefined) next.instructorId = patch.instructorId;
  if (patch.status) next.status = patch.status as ScheduleRow["status"];
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.memo !== undefined) next.memo = patch.memo;
  if (patch.studentIds !== undefined) next.studentIds = patch.studentIds;
  if (patch.courseId !== undefined) next.courseId = patch.courseId;
  if (patch.topic !== undefined) next.topic = patch.topic;
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.mode !== undefined) next.mode = patch.mode;
  return next;
}
