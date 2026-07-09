import type { Conflict, Room, ScheduleResources, ScheduleRow } from "@/types";
import { crossMidnightEnd, WEEKDAYS_KO as WD } from "@/lib/domain/schedule";

const CONFLICT_LABEL: Record<string, string> = {
  double_book: "이중예약",
  unavailable: "불가시간 겹침",
  room_capacity: "강의실 정원 초과",
};

type ConflictMessageContext = {
  rows: ScheduleRow[];
  resources?: ScheduleResources | null;
  rooms?: Room[];
};

function resourceName(c: Conflict, ctx: ConflictMessageContext): string {
  if (c.resource === "instructor")
    return ctx.resources?.instructors.find((i) => Number(i.id) === Number(c.resourceId))?.name ?? `강사#${c.resourceId}`;
  if (c.resource === "room")
    return (ctx.resources?.rooms ?? ctx.rooms ?? []).find((r) => Number(r.id) === Number(c.resourceId))?.name ?? `강의실#${c.resourceId}`;
  if (c.resource === "student")
    return ctx.resources?.students.find((s) => Number(s.id) === Number(c.resourceId))?.name ?? `학생#${c.resourceId}`;
  return "";
}

function timeLabel(r: ScheduleRow): string {
  const end = r.endTime ?? (crossMidnightEnd(r) ? `익일 ${crossMidnightEnd(r)}` : "");
  return `${r.sessionDate} (${WD[r.weekday]}) ${r.startTime ?? ""}${end ? `-${end}` : ""}`;
}

function doubleBookMessage(c: Conflict, other: ScheduleRow | undefined, ctx: ConflictMessageContext): string {
  const name = resourceName(c, ctx);
  if (!other) {
    const target = c.sessionId != null ? `기존 수업 #${c.sessionId}` : "기존 수업";
    return `${c.resource === "room" ? "강의실" : c.resource === "student" ? "학생" : "강사"} ${name}의 ${target}과 겹칩니다${c.detail ? ` (${c.detail})` : ""}.`;
  }
  if (c.resource === "room") {
    return `강의실 ${name}에서 진행 중인 "${other.courseName}" 수업과 겹칩니다. 담당 강사: ${other.instructorName}. 시간: ${timeLabel(other)}.`;
  }
  if (c.resource === "student") {
    return `학생 ${name}의 기존 수업 "${other.courseName}"과 겹칩니다. 담당 강사: ${other.instructorName}. 시간: ${timeLabel(other)}.`;
  }
  return `강사 ${other.instructorName}의 기존 수업 "${other.courseName}"과 겹칩니다. 시간: ${timeLabel(other)}${other.roomName ? `, 강의실: ${other.roomName}` : ""}.`;
}

function unavailableMessage(c: Conflict, ctx: ConflictMessageContext): string {
  const name = resourceName(c, ctx);
  const owner = c.resource === "room" ? `강의실 ${name}` : c.resource === "student" ? `학생 ${name}` : `강사 ${name}`;
  return `${owner}의 ${c.detail ?? CONFLICT_LABEL.unavailable}과 겹칩니다.`;
}

export function formatScheduleConflicts(conflicts: Conflict[], ctx: ConflictMessageContext): string {
  return conflicts
    .map((c) => {
      const other = c.sessionId != null ? ctx.rows.find((r) => Number(r.id) === Number(c.sessionId)) : undefined;
      if (c.type === "double_book") return `· ${doubleBookMessage(c, other, ctx)}`;
      if (c.type === "unavailable") return `· ${unavailableMessage(c, ctx)}`;
      const who = c.resource ? `${c.resource === "instructor" ? "강사" : c.resource === "room" ? "강의실" : "학생"} ${resourceName(c, ctx)}` : "";
      const what = CONFLICT_LABEL[c.type] ?? c.type;
      return `· ${who} ${what}${c.detail ? ` - ${c.detail}` : ""}`.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}
