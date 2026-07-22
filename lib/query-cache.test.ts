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
  STUDENT_RELATED_SCOPES,
  invalidateInstructorAggregate,
  invalidateCourseAggregate,
  invalidateStudentAggregate,
  optimisticallyPatchStudent,
  optimisticallyRemoveStudent,
  reconcileStudentCommand,
  rollbackStudentCache,
  refreshScheduleRequestLifecycle,
} from "./query-cache";
import { qk } from "./queryKeys";
import type { Student, StudentAggregate } from "@/types";

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

describe("student command cache lifecycle (TBO-44)", () => {
  const student = { id: 13, name: "학생13", status: "enrolled" } as Student;
  const aggregate = { student, interests: [], guardians: [] } as StudentAggregate;

  it("상태 변경은 list/detail을 낙관 반영하고 실패 시 동일 snapshot으로 롤백한다", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.students.list(), [student]);
    queryClient.setQueryData(qk.students.aggregate(student.id), aggregate);
    const snapshot = await optimisticallyPatchStudent(queryClient, student.id, { status: "withdrawn" });
    expect(queryClient.getQueryData<Student[]>(qk.students.list())?.[0].status).toBe("withdrawn");
    expect(queryClient.getQueryData<StudentAggregate>(qk.students.aggregate(student.id))?.student.status).toBe("withdrawn");
    rollbackStudentCache(queryClient, student.id, snapshot);
    expect(queryClient.getQueryData<Student[]>(qk.students.list())?.[0].status).toBe("enrolled");
    expect(queryClient.getQueryData<StudentAggregate>(qk.students.aggregate(student.id))?.student.status).toBe("enrolled");
  });

  it("원부 삭제는 목록에서 즉시 제거하고 실패 시 복구한다", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.students.list(), [student]);
    const snapshot = await optimisticallyRemoveStudent(queryClient, student.id);
    expect(queryClient.getQueryData<Student[]>(qk.students.list())).toEqual([]);
    rollbackStudentCache(queryClient, student.id, snapshot);
    expect(queryClient.getQueryData<Student[]>(qk.students.list())).toEqual([student]);
  });

  it("삭제 성공 재검증은 DB list/연관 scope만 refetch하고 삭제 aggregate 404 재요청은 금지한다", async () => {
    const { queryClient, spy } = spyInvalidate();
    await reconcileStudentCommand(queryClient, { studentId: student.id, deleted: true });
    const studentCalls = spy.mock.calls
      .map(([options]) => options as { queryKey: readonly unknown[]; exact?: boolean; refetchType?: string })
      .filter((options) => options.queryKey[0] === "students");
    expect(studentCalls).toEqual([
      expect.objectContaining({ queryKey: qk.students.list(), exact: true, refetchType: "active" }),
      expect.objectContaining({ queryKey: qk.students.aggregate(student.id), exact: true, refetchType: "none" }),
    ]);
    expect(studentCalls).not.toContainEqual(expect.objectContaining({ queryKey: qk.students.all, refetchType: "active" }));
  });

  it("학생 등록/상태 변경은 수강·보호자·상담과 schedule 목록/자원/대시보드 prefix까지 전파한다", () => {
    expect(STUDENT_RELATED_SCOPES).toEqual(expect.arrayContaining([
      qk.enrollments.all, qk.parents.all, qk.counsel.all, qk.schedule.all,
    ]));
    expect(qk.schedule.list({}, "manager").slice(0, qk.schedule.all.length)).toEqual(qk.schedule.all);
    expect(qk.schedule.resources("manager").slice(0, qk.schedule.all.length)).toEqual(qk.schedule.all);
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

  it("강사 등록/수정은 수업 기본 페이와 schedule resource/list를 같은 prefix로 갱신한다", () => {
    expect(INSTRUCTOR_AGGREGATE_SCOPES).toEqual(expect.arrayContaining([
      qk.instructors.all, qk.users.all, qk.courses.all, qk.schedule.all, qk.payouts.all,
    ]));
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

  it("수업 등록/수정은 캘린더 join picker와 대표·매니저 대시보드 schedule을 함께 갱신한다", () => {
    expect(COURSE_AGGREGATE_SCOPES).toEqual(expect.arrayContaining([
      qk.courses.all, qk.schedule.all, qk.payouts.all,
    ]));
  });
});
