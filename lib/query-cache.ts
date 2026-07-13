import type { QueryClient } from "@tanstack/react-query";
import type { ScheduleRequestEx } from "./api";
import { qk } from "./queryKeys";

export const scheduleRequestListKey = (scope: string) => qk.scheduleRequests.list(scope);

export function upsertScheduleRequestCache(
  queryClient: QueryClient,
  scope: string,
  row?: ScheduleRequestEx,
) {
  if (!row) return;
  queryClient.setQueryData<ScheduleRequestEx[]>(scheduleRequestListKey(scope), (previous = []) =>
    [row, ...previous.filter((request) => request.id !== row.id)].sort((a, b) => b.id - a.id),
  );
}

export const invalidateScheduleRequests = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: qk.scheduleRequests.all, refetchType: "active" });

export async function invalidateScheduleLifecycle(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.schedule.all, refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: qk.attendance.all, refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: qk.reports.all, refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: qk.payouts.all, refetchType: "active" }),
  ]);
}

export async function refreshScheduleRequestLifecycle(
  queryClient: QueryClient,
  options: { schedule?: boolean; availability?: boolean } = {},
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    invalidateScheduleRequests(queryClient),
    queryClient.invalidateQueries({ queryKey: ["audit"], refetchType: "active" }),
  ];
  if (options.schedule) tasks.push(invalidateScheduleLifecycle(queryClient));
  if (options.availability) {
    tasks.push(queryClient.invalidateQueries({ queryKey: qk.availability.all, refetchType: "active" }));
  }
  await Promise.all(tasks);
}
