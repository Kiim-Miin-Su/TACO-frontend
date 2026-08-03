import { describe, expect, it } from "vitest";
import type { InstructorAttendanceLedgerEntry } from "@kms545487/contracts";
import { filterLedgerByInstructors, groupAttendanceLedger } from "./staff-attendance";

const entries: InstructorAttendanceLedgerEntry[] = [
  { key: "class:2", source: "class_session", recordId: 2, sessionId: 2, instructorId: 2, instructorName: "김강사", date: "2026-08-02", status: "present", teachingMinutes: 60, countsForPay: true },
  { key: "staff:1", source: "staff_day", recordId: 1, instructorId: 1, instructorName: "박강사", date: "2026-08-03", status: "paid_leave", teachingMinutes: 0, countsForPay: false },
  { key: "class:1", source: "class_session", recordId: 1, sessionId: 1, instructorId: 1, instructorName: "박강사", date: "2026-08-03", status: "late", teachingMinutes: 90, countsForPay: true },
];

describe("staff attendance ledger projection", () => {
  it("groups by date descending and instructor name within the date", () => {
    const groups = groupAttendanceLedger(entries, "date");
    expect(groups.map((group) => group.key)).toEqual(["2026-08-03", "2026-08-02"]);
    expect(groups[0].entries.map((entry) => entry.instructorName)).toEqual(["박강사", "박강사"]);
  });

  it("groups by instructor name and keeps dates descending", () => {
    const groups = groupAttendanceLedger(entries, "instructor");
    expect(groups.map((group) => group.label)).toEqual(["김강사", "박강사"]);
    expect(groups[1].entries.map((entry) => entry.date)).toEqual(["2026-08-03", "2026-08-03"]);
  });

  it("filters selected instructors without changing the source array", () => {
    expect(filterLedgerByInstructors(entries, new Set([2])).map((entry) => entry.instructorId)).toEqual([2]);
    expect(entries).toHaveLength(3);
  });
});
