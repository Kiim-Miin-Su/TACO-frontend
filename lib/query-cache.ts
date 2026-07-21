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

// [TBO-35 35A] 학생 aggregate 쓰기는 학생/수강/보호자 화면뿐 아니라 캘린더의 별도
// /schedule/resources 읽기모델도 바꾼다. 네 scope를 한 helper로 묶어 등록·직접생성·수정·삭제 중
// 어느 경로에서도 신규 학생/상태/국가가 5분 stale cache에 남지 않게 한다.
export const STUDENT_AGGREGATE_SCOPES = [
  qk.students.all,
  qk.enrollments.all,
  qk.parents.all,
  qk.counsel.all,
  qk.schedule.all,
] as const;

export async function invalidateStudentAggregate(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    STUDENT_AGGREGATE_SCOPES.map((key) =>
      queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[], refetchType: "active" }),
    ),
  );
}

// 강사 aggregate 변경은 관리자 목록뿐 아니라 수업 기본 페이, 캘린더 자원, 정산 계산에 전파된다.
export const INSTRUCTOR_AGGREGATE_SCOPES = [
  qk.instructors.all,
  qk.users.all,
  qk.courses.all,
  qk.schedule.all,
  qk.payouts.all,
] as const;

export async function invalidateInstructorAggregate(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    INSTRUCTOR_AGGREGATE_SCOPES.map((key) =>
      queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[], refetchType: "active" }),
    ),
  );
}

export const COURSE_AGGREGATE_SCOPES = [qk.courses.all, qk.schedule.all, qk.payouts.all] as const;

export async function invalidateCourseAggregate(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    COURSE_AGGREGATE_SCOPES.map((key) =>
      queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[], refetchType: "active" }),
    ),
  );
}

/** @deprecated [C4] invalidateCalendarCommand로 통일 — 부분 무효화 편차 방지를 위해 위임만 남긴다. */
export async function invalidateScheduleLifecycle(queryClient: QueryClient): Promise<void> {
  await invalidateCalendarCommand(queryClient);
}

// [B6 C2/EP5 P2] kind별 부분 무효화 복원 — 호출부(useApproveScheduleRequest)가 계산해 넘기던
//  options를 C4가 버리고 있었다. **가용/불가 전용 요청**(availability=true·schedule=false)은 세션·
//  출결·리포트·정산 데이터와 무관하므로 3-scope만 무효화한다. 세션 계열이거나 kind가 불명확하면
//  C4 규약(7-scope) 유지 — 정확성 우선, 축소는 무해가 증명된 경우만(B6 문서 §4).
const AVAILABILITY_COMMAND_SCOPES = [
  qk.availability.all,
  qk.scheduleRequests.all,
  ["audit"] as const,
] as const;

export async function refreshScheduleRequestLifecycle(
  queryClient: QueryClient,
  options: { schedule?: boolean; availability?: boolean } = {},
): Promise<void> {
  if (options.availability === true && options.schedule === false) {
    await Promise.all(
      AVAILABILITY_COMMAND_SCOPES.map((key) =>
        queryClient.invalidateQueries({ queryKey: key as unknown as readonly unknown[], refetchType: "active" }),
      ),
    );
    return;
  }
  await invalidateCalendarCommand(queryClient);
}
