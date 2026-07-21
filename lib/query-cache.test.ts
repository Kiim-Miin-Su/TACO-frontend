// [B6 C2/EP5 P2] 요청 생명주기 무효화 — kind별 분기 회귀 고정.
//  가용/불가 전용 승인은 3-scope(availability·scheduleRequests·audit)만, 세션 계열·kind 불명은
//  TBO-29C C4 규약(7-scope) 유지. options를 다시 버리는(전부 7-scope) 회귀와, 반대로 세션 계열까지
//  좁혀버리는(출결·정산 stale — C4가 고친 결함 재발) 회귀를 모두 잡는다.
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  CALENDAR_COMMAND_SCOPES,
  COURSE_AGGREGATE_SCOPES,
  INSTRUCTOR_AGGREGATE_SCOPES,
  STUDENT_AGGREGATE_SCOPES,
  invalidateInstructorAggregate,
  invalidateCourseAggregate,
  invalidateStudentAggregate,
  refreshScheduleRequestLifecycle,
} from "./query-cache";

const spyInvalidate = () => {
  const queryClient = new QueryClient();
  const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  return { queryClient, spy };
};
const calledRoots = (spy: ReturnType<typeof spyInvalidate>["spy"]) =>
  spy.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey: unknown }).queryKey));

describe("refreshScheduleRequestLifecycle (EP5 P2)", () => {
  it("가용/불가 전용(availability=true, schedule=false) → 3-scope만, payouts/attendance/reports 미무효화", async () => {
    const { queryClient, spy } = spyInvalidate();
    await refreshScheduleRequestLifecycle(queryClient, { schedule: false, availability: true });
    const roots = calledRoots(spy);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(roots).toContain(JSON.stringify(["availability"]));
    expect(roots).toContain(JSON.stringify(["scheduleRequests"]));
    expect(roots).toContain(JSON.stringify(["audit"]));
    expect(roots).not.toContain(JSON.stringify(["payouts"]));
    expect(roots).not.toContain(JSON.stringify(["attendance"]));
    expect(roots).not.toContain(JSON.stringify(["reports"]));
  });

  it("세션 계열(schedule=true) → C4 7-scope 전량 유지(출결·시수·정산 정합)", async () => {
    const { queryClient, spy } = spyInvalidate();
    await refreshScheduleRequestLifecycle(queryClient, { schedule: true, availability: false });
    expect(spy).toHaveBeenCalledTimes(CALENDAR_COMMAND_SCOPES.length);
  });

  it("options 없음(반려·수정·철회 경로) → 보수적으로 7-scope 유지", async () => {
    const { queryClient, spy } = spyInvalidate();
    await refreshScheduleRequestLifecycle(queryClient);
    expect(spy).toHaveBeenCalledTimes(CALENDAR_COMMAND_SCOPES.length);
  });
});

describe("invalidateStudentAggregate (TBO-35 35A)", () => {
  it("학생 쓰기 후 명단·수강·보호자·상담 aggregate와 calendar resources를 함께 갱신한다", async () => {
    const { queryClient, spy } = spyInvalidate();

    await invalidateStudentAggregate(queryClient);

    const roots = calledRoots(spy);
    expect(spy).toHaveBeenCalledTimes(STUDENT_AGGREGATE_SCOPES.length);
    expect(roots).toContain(JSON.stringify(["students"]));
    expect(roots).toContain(JSON.stringify(["enrollments"]));
    expect(roots).toContain(JSON.stringify(["parents"]));
    expect(roots).toContain(JSON.stringify(["counsel"]));
    expect(roots).toContain(JSON.stringify(["schedule"]));
    for (const [options] of spy.mock.calls) {
      expect(options).toMatchObject({ refetchType: "active" });
    }
  });
});

describe("invalidateInstructorAggregate (TBO-36 36B)", () => {
  it("강사 변경 후 관리자 목록·유저·수업·calendar resources·정산을 함께 갱신한다", async () => {
    const { queryClient, spy } = spyInvalidate();
    await invalidateInstructorAggregate(queryClient);
    const roots = calledRoots(spy);
    expect(spy).toHaveBeenCalledTimes(INSTRUCTOR_AGGREGATE_SCOPES.length);
    for (const root of [["instructors"], ["users"], ["courses"], ["schedule"], ["payouts"]]) {
      expect(roots).toContain(JSON.stringify(root));
    }
    for (const [options] of spy.mock.calls) expect(options).toMatchObject({ refetchType: "active" });
  });
});

describe("invalidateCourseAggregate (TBO-36 36C)", () => {
  it("수업 페이/Kinder 변경 후 course·calendar·payout을 함께 갱신한다", async () => {
    const { queryClient, spy } = spyInvalidate();
    await invalidateCourseAggregate(queryClient);
    expect(spy).toHaveBeenCalledTimes(COURSE_AGGREGATE_SCOPES.length);
    expect(calledRoots(spy)).toEqual(expect.arrayContaining(
      [["courses"], ["schedule"], ["payouts"]].map((root) => JSON.stringify(root)),
    ));
  });
});
