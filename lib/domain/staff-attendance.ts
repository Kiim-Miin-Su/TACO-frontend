import type { InstructorAttendanceLedgerEntry, StaffAttendanceStatus } from "@kms545487/contracts";

export type AttendanceLedgerGroupMode = "date" | "instructor";

export const STAFF_ATTENDANCE_LABEL: Record<StaffAttendanceStatus, string> = {
  present: "출근",
  late: "지각",
  absent: "결근",
  paid_leave: "유급 휴가",
  unpaid_leave: "무급 휴가",
  sick_leave: "병가",
  remote_work: "재택",
};

export const LESSON_ATTENDANCE_LABEL = {
  present: "출석",
  late: "지각",
  absent: "결석",
  makeup: "보강",
  unmarked: "미입력",
} as const;

export function filterLedgerByInstructors(
  entries: InstructorAttendanceLedgerEntry[],
  instructorIds: ReadonlySet<number>,
): InstructorAttendanceLedgerEntry[] {
  return instructorIds.size === 0 ? entries : entries.filter((entry) => instructorIds.has(Number(entry.instructorId)));
}

export function groupAttendanceLedger(
  entries: InstructorAttendanceLedgerEntry[],
  mode: AttendanceLedgerGroupMode,
): Array<{ key: string; label: string; entries: InstructorAttendanceLedgerEntry[] }> {
  const sorted = [...entries].sort((a, b) => mode === "date"
    ? b.date.localeCompare(a.date) || a.instructorName.localeCompare(b.instructorName, "ko") || a.key.localeCompare(b.key)
    : a.instructorName.localeCompare(b.instructorName, "ko") || b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const groups = new Map<string, { key: string; label: string; entries: InstructorAttendanceLedgerEntry[] }>();
  for (const entry of sorted) {
    const key = mode === "date" ? entry.date : String(entry.instructorId);
    const group = groups.get(key) ?? { key, label: mode === "date" ? entry.date : entry.instructorName, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}
