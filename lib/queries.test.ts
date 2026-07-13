import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { scheduleRequestListKey, upsertScheduleRequestCache } from "./query-cache";
import type { ScheduleRequestEx } from "./api";

const request = (id: number, topic: string): ScheduleRequestEx => ({
  id,
  requesterId: 1,
  requestKind: "session_create",
  courseId: 10,
  instructorId: 1,
  sessionDate: "2026-07-10",
  startTime: "08:00",
  endTime: "09:00",
  durationMinutes: 60,
  kind: "class",
  topic,
  status: "pending",
} as ScheduleRequestEx);

describe("schedule request cache helpers", () => {
  it("upserts created pending requests into the scoped list cache newest-first", () => {
    const qc = new QueryClient();
    const scope = "1:instructor";
    qc.setQueryData(scheduleRequestListKey(scope), [request(1, "old")]);

    upsertScheduleRequestCache(qc, scope, request(3, "new"));

    expect(qc.getQueryData<ScheduleRequestEx[]>(scheduleRequestListKey(scope))?.map((r) => r.id)).toEqual([3, 1]);
  });

  it("replaces a duplicate request row instead of appending a ghost duplicate", () => {
    const qc = new QueryClient();
    const scope = "1:instructor";
    qc.setQueryData(scheduleRequestListKey(scope), [request(2, "stale")]);

    upsertScheduleRequestCache(qc, scope, request(2, "fresh"));

    expect(qc.getQueryData<ScheduleRequestEx[]>(scheduleRequestListKey(scope))).toEqual([request(2, "fresh")]);
  });

  it("does not leak a request update into another authentication scope", () => {
    const qc = new QueryClient();
    qc.setQueryData(scheduleRequestListKey("4:manager"), [request(4, "manager stale")]);
    qc.setQueryData(scheduleRequestListKey("3:super_admin"), [request(4, "super stale")]);

    const approved = { ...request(4, "approved"), status: "approved" as const };
    upsertScheduleRequestCache(qc, "4:manager", approved);

    expect(qc.getQueryData<ScheduleRequestEx[]>(scheduleRequestListKey("4:manager"))).toEqual([approved]);
    expect(qc.getQueryData<ScheduleRequestEx[]>(scheduleRequestListKey("3:super_admin"))).toEqual([request(4, "super stale")]);
  });
});
