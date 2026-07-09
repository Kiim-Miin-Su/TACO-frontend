import { describe, expect, it } from "vitest";
import type { Conflict, ScheduleResources, ScheduleRow } from "@/types";
import { formatScheduleConflicts } from "./conflict-messages";

const row = {
  id: 1,
  courseId: 10,
  instructorId: 1,
  roomId: 1,
  sessionDate: "2026-07-06",
  startTime: "16:00",
  endTime: "17:30",
  durationMinutes: 90,
  status: "scheduled",
  weekday: 1,
  courseName: "SAT Reading 정규",
  subjectName: "영어",
  instructorName: "박지훈",
  roomName: "A101",
  studentIds: [1],
  studentNames: ["김서연"],
} as ScheduleRow;

const resources = {
  instructors: [{ id: 1, name: "박지훈", sub: "영어" }],
  rooms: [{ id: 1, name: "A101", capacity: 6 }],
  students: [{ id: 1, name: "김서연", grade: "11학년" }],
  courses: [],
} as unknown as ScheduleResources;

describe("formatScheduleConflicts", () => {
  it("강사 이중예약 alert에 강사명과 기존 수업명을 함께 표시한다", () => {
    const conflicts: Conflict[] = [{ type: "double_book", resource: "instructor", resourceId: 1, sessionId: 1 }];
    const msg = formatScheduleConflicts(conflicts, { rows: [row], resources });
    expect(msg).toContain("강사 박지훈");
    expect(msg).toContain("SAT Reading 정규");
    expect(msg).toContain("2026-07-06");
    expect(msg).toContain("16:00-17:30");
  });

  it("강의실 이중예약 alert에도 기존 수업 담당 강사를 표시한다", () => {
    const conflicts: Conflict[] = [{ type: "double_book", resource: "room", resourceId: 1, sessionId: 1 }];
    const msg = formatScheduleConflicts(conflicts, { rows: [row], resources });
    expect(msg).toContain("강의실 A101");
    expect(msg).toContain("SAT Reading 정규");
    expect(msg).toContain("담당 강사: 박지훈");
  });

  it("불가시간 alert에는 어떤 강사의 불가시간인지 표시한다", () => {
    const conflicts: Conflict[] = [{ type: "unavailable", resource: "instructor", resourceId: 1, detail: "불가시간 12:00-13:00" }];
    const msg = formatScheduleConflicts(conflicts, { rows: [row], resources });
    expect(msg).toContain("강사 박지훈");
    expect(msg).toContain("불가시간 12:00-13:00");
  });
});
