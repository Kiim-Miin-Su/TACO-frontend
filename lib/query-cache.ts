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

// [TBO-29C C4] 캘린더 명령(수업·가용 쓰기·승인/반려) 무효화의 **단일 소스** — 구 구현은 mutation마다
//  부분 집합을 골라 무효화해 캘린더는 갱신됐지만 출결·시수·리포트·정산이 순간적으로 이전 값일 수 있었다.
//  어떤 캘린더 커밋이든 이 7개 scope를 한 번에 무효화한다(활성 조회만 refetch — 과무효화 비용은 미미).
export const CALENDAR_COMMAND_SCOPES = [
  qk.schedule.all,
  qk.availability.all,
  qk.scheduleRequests.all,
  qk.attendance.all,
  qk.reports.all,
  qk.payouts.all,
  ["audit"] as const,
] as const;

export async function invalidateCalendarCommand(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    CALENDAR_COMMAND_SCOPES.map((key) => queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[], refetchType: "active" })),
  );
}

/** @deprecated [C4] invalidateCalendarCommand로 통일 — 부분 무효화 편차 방지를 위해 위임만 남긴다. */
export async function invalidateScheduleLifecycle(queryClient: QueryClient): Promise<void> {
  await invalidateCalendarCommand(queryClient);
}

export async function refreshScheduleRequestLifecycle(
  queryClient: QueryClient,
  _options: { schedule?: boolean; availability?: boolean } = {},
): Promise<void> {
  // [C4] 요청 생명주기도 캘린더 명령 무효화로 통일(요청 kind별 부분 무효화 폐기).
  await invalidateCalendarCommand(queryClient);
}
