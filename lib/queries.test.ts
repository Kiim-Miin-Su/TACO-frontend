import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  beginScheduleListCacheTransaction,
  acceptAuthoritativeScheduleRows,
  reconcileScheduleCommandIfLast,
  SCHEDULE_COMMAND_MUTATION_KEY,
  scheduleRequestListKey,
  updateScheduleListCache,
  upsertScheduleRequestCache,
} from "./query-cache";
import type { ScheduleRequestEx } from "./api";
import type { ScheduleRow } from "@/types";

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

describe("bounded schedule list cache helper", () => {
  const range = { from: "2026-08-18", to: "2026-08-24" };
  const row = (id: number, topic: string) => ({ id, topic } as ScheduleRow);

  it("patches only the matching range and authentication scope", () => {
    const qc = new QueryClient();
    updateScheduleListCache(qc, range, "4:manager", [row(1, "manager")]);
    updateScheduleListCache(qc, range, "9:instructor", [row(1, "instructor")]);

    updateScheduleListCache(qc, range, "4:manager", (current) =>
      current.map((item) => item.id === 1 ? row(1, "optimistic") : item),
    );

    expect(qc.getQueryData<ScheduleRow[]>(["schedule", "list", "4:manager", range])).toEqual([row(1, "optimistic")]);
    expect(qc.getQueryData<ScheduleRow[]>(["schedule", "list", "9:instructor", range])).toEqual([row(1, "instructor")]);
  });

  it("restores an exact snapshot for atomic rollback", () => {
    const qc = new QueryClient();
    const snapshot = [row(1, "before")];
    updateScheduleListCache(qc, range, "4:manager", snapshot);
    updateScheduleListCache(qc, range, "4:manager", (current) => [...current, row(-1, "preview")]);
    updateScheduleListCache(qc, range, "4:manager", snapshot);

    expect(qc.getQueryData<ScheduleRow[]>(["schedule", "list", "4:manager", range])).toEqual(snapshot);
  });

  it("cancels the exact GET and rolls back only its own command", async () => {
    const qc = new QueryClient();
    const cancel = vi.spyOn(qc, "cancelQueries");
    updateScheduleListCache(qc, range, "4:manager", [row(1, "A before"), row(2, "B before")]);
    const transaction = await beginScheduleListCacheTransaction(
      qc,
      range,
      "4:manager",
      (current) => current.map((item) => item.id === 1 ? row(1, "A preview") : item),
      (current, before) => {
        const original = before.find((item) => item.id === 1);
        return current.map((item) => item.id === 1 && original ? original : item);
      },
    );

    updateScheduleListCache(qc, range, "4:manager", (current) =>
      current.map((item) => item.id === 2 ? row(2, "B committed") : item),
    );
    transaction.rollback();

    expect(cancel).toHaveBeenCalledWith({
      queryKey: ["schedule", "list", "4:manager", range],
      exact: true,
    });
    expect(qc.getQueryData<ScheduleRow[]>(["schedule", "list", "4:manager", range])).toEqual([
      row(1, "A before"),
      row(2, "B committed"),
    ]);
  });

  it("defers schedule refetch until the last concurrent command settles", async () => {
    const qc = new QueryClient();
    const mutating = vi.spyOn(qc, "isMutating").mockReturnValue(2);
    const invalidate = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();

    await reconcileScheduleCommandIfLast(qc);
    expect(invalidate).not.toHaveBeenCalled();

    mutating.mockReturnValue(1);
    await reconcileScheduleCommandIfLast(qc);
    expect(mutating).toHaveBeenCalledWith({ mutationKey: SCHEDULE_COMMAND_MUTATION_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["schedule"], refetchType: "active" });
  });

  it("replaces only command temp rows with authoritative rows inside the bounded range", () => {
    const current = [
      { ...row(-1, "preview A"), sessionDate: "2026-08-18" },
      { ...row(-2, "preview B"), sessionDate: "2026-08-19" },
      { ...row(9, "concurrent"), sessionDate: "2026-08-20" },
    ];
    const result = acceptAuthoritativeScheduleRows(
      current,
      range,
      [-1],
      [
        { ...row(101, "server A"), sessionDate: "2026-08-18" },
        { ...row(102, "outside"), sessionDate: "2026-08-25" },
      ],
    );

    expect(result.map((item) => item.id)).toEqual([-2, 9, 101]);
  });
});
