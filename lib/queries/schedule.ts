"use client";
// 캘린더·스케줄·수업요청·강의실·가용성·출결·이벤트 도메인 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import {
  invalidateCalendarCommand,
  invalidateClassOpening,
  invalidateScheduleRequests,
  refreshScheduleRequestLifecycle,
  scheduleRequestListKey,
  upsertScheduleRequestCache,
} from "@/lib/query-cache";
import { useAccountAccess } from "@/lib/useAccountAccess";
import type { Instructor } from "@/types";
import { pushScheduleUndo, sanitizeInversePatch } from '@/lib/schedule-undo'; // [TBO-63] 캘린더 undo 스택
import { useState } from "react";
import { CATALOG_STALE, detailRetry, useInvalidator } from "./shared";
import type {
  ClearInstructorAttendanceInput,
  SessionAccountingImpactConflict,
  SetInstructorAttendanceInput,
} from "@kms545487/contracts";

export const useSchedule = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.list({}, scope), queryFn: ({ signal }) => api.schedule.list({}, { signal }) });
};
// [TBO-14] 캘린더 데이터층 — 기간·선택자원 파라미터 스케줄 조회. qk.schedule 하위키라 세션 변경(PATCH/생성/삭제·
//  강사출결)이 qk.schedule.all 무효화로 자동 반영(M1 invalidate 단절 해소). 뷰는 이 데이터를 rows로 feed.
export const useCalendarSchedule = (params: { from?: string; to?: string; instructorId?: number; roomId?: number; studentId?: number }) => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.list(params, scope), queryFn: ({ signal }) => api.schedule.list(params, { signal }) });
};
// [TBO-14 C2] 캘린더 준정적 카탈로그 — 강의실·자원 피커. staleTime 5분(변경 빈도 낮음·쓰기 시 invalidate).
export const useRooms = () => useQuery({ queryKey: qk.rooms.all(), queryFn: () => api.rooms.list(), staleTime: CATALOG_STALE });
export const useScheduleResources = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.resources(scope), queryFn: ({ signal }) => api.schedule.resources({ signal }), staleTime: CATALOG_STALE });
};
// [TBO-14 C2b] 전체 가용/불가 블록 — 캘린더 밴드 단일 소스(selBlocks는 뷰에서 owner 파생). 밴드 편집 시 invalidate.
export const useAllAvailability = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.availability.everything(scope), queryFn: ({ signal }) => api.availability.all({ signal }) });
};
export const useAttendance = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.attendance.list(scope), queryFn: ({ signal }) => api.attendance.list({ signal }) });
};

// [TBO-16 #9] 수업 요청 — 승인센터·배지(tasks)·캘린더가 **같은 queryKey를 구독**(단일 이벤트 객체).
//  서버가 역할별 스코프 적용(강사=본인 요청만) — 클라 필터 불요.
export const useScheduleRequests = () => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: scheduleRequestListKey(scope), queryFn: ({ signal }) => api.scheduleRequests.list(undefined, { signal }) });
};
export const useAcademyEvents = () => useQuery({ queryKey: qk.events.list(), queryFn: () => api.events.list() });

// [강사 출결 상세] 특정 강사의 기간 세션 — **권위 소스 /schedule 서버 필터**(instructorId·from·to). 참조 무결성:
//  세션 데이터를 복제하지 않고 단일 소스에서 조회, qk.schedule 하위 키라 세션 변경 시 자동 무효화.
export const useInstructorSessions = (instructorId: number | null, from?: string, to?: string) => {
  const { scope, can } = useAccountAccess();
  return useQuery({
    queryKey: qk.schedule.list({ instructorId: instructorId ?? undefined, from, to }, scope),
    queryFn: () => api.schedule.list({ instructorId: instructorId as number, from, to }),
    enabled: can("admin.area") && instructorId != null && !!from && !!to,
  });
};
// [TBO-19] 강사 출결 현황 집계(관리자 대시보드) — 기간·강사 필터. 서버 집계(DB 이관 시 GROUP BY 승격).
export const useInstructorAttendanceSummary = (from?: string, to?: string, instructorId?: number) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.schedule.instructorAttendanceSummary(from, to, instructorId), // [TBO-56 C2b] schedule 루트 편입 — 캘린더 명령 무효화 자동 커버
    queryFn: () => api.schedule.instructorAttendanceSummary(from, to, instructorId),
    enabled: can("admin.area") && !!from && !!to,
  });
};

export const useScheduleSession = (id: number | null) => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.schedule.detail(id ?? 0, scope), queryFn: () => api.schedule.get(id as number), enabled: id != null, retry: detailRetry });
};

// 강사 목록 = 스케줄 자원(resources)에서 파생(단일 소스). store.instructors 대체.
export const useInstructors = () => {
  const { scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.schedule.resources(scope),
    queryFn: ({ signal }) => api.schedule.resources({ signal }),
    select: (res): Instructor[] => res.instructors
      .filter((i) => i.scheduleOwnerRole !== "super_admin")
      .map((i) => ({
      id: i.id,
      name: i.name,
      subjectName: i.sub,
      defaultHourlyRate: 0,
      canTeachKinder: false,
    })),
    staleTime: CATALOG_STALE,
  });
};

export const useCreateEvent = () => useMutation({ mutationFn: api.events.create, onSuccess: useInvalidator([qk.events.all]) });
// [TBO-29D 요구 ⑥] 매니저 이상 — 이벤트 수정/삭제(admin 이벤트 화면 + 캘린더 공통 일정 최신화).
export const useUpdateEvent = () =>
  useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.events.update>[1] }) => api.events.update(v.id, v.patch),
    onSuccess: useInvalidator([qk.events.all]),
  });
export const useRemoveEvent = () => useMutation({ mutationFn: api.events.remove, onSuccess: useInvalidator([qk.events.all]) });
// [B4 2026-07-16] 강의실 관리(매니저 이상) — 성공 시 qk.rooms 무효화로 수업탭 목록·수업 추가 모달 select가 동시 갱신.
export const useCreateRoom = () => useMutation({ mutationFn: api.rooms.create, onSuccess: useInvalidator([qk.rooms.all()]) });
export const useUpdateRoom = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.rooms.update>[1] }) => api.rooms.update(v.id, v.patch), onSuccess: useInvalidator([qk.rooms.all()]) });
export const useRemoveRoom = () => useMutation({ mutationFn: api.rooms.remove, onSuccess: useInvalidator([qk.rooms.all()]) });

// [B6 C4/EP9] 가용/불가 블록 쓰기 — ScheduleCalendar 수동 api.availability.* 잔재의 중앙 훅화.
//  무효화는 availability.all만(EP5 — 블록은 세션·출결·리포트·정산 데이터와 무관, 종전
//  reloadSelBlocks=invalidate(qk.availability.all)와 동일 범위. 승인 필요 409 처리는 호출부 소관).
export const useUpsertAvailability = () =>
  useMutation({ mutationFn: api.availability.upsert, onSuccess: useInvalidator([qk.availability.all]) });
export const useRemoveAvailability = () =>
  useMutation({ mutationFn: api.availability.remove, onSuccess: useInvalidator([qk.availability.all]) });


// [TBO-63] undo용 before 스냅샷 — ["schedule"] 하위 캐시(목록·단건)에서 세션 행을 찾는다.
//  서버 캐시가 곧 화면의 진실이므로, 사용자가 되돌리길 기대하는 값과 항상 일치한다.
function cachedScheduleRow(qc: ReturnType<typeof useQueryClient>, id: number): Record<string, unknown> | undefined {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: qk.schedule.all })) { // [TBO-79 G4]
    if (Array.isArray(data)) {
      const hit = (data as Array<{ id?: number }>).find((row) => row && row.id === id);
      if (hit) return hit as Record<string, unknown>;
    } else if (data && typeof data === "object" && (data as { id?: number }).id === id) {
      return data as Record<string, unknown>;
    }
  }
  return undefined;
}
// 역패치 대상 필드(단일 회차 편집 표면) — patch가 건드린 키만 before 값으로 되돌린다.
const UNDOABLE_FIELDS = [
  "sessionDate", "startTime", "endTime", "durationMinutes", "roomId", "instructorId", "courseId",
  "studentIds", "topic", "memo", "color", "status", "kind", "mode",
] as const;
// 스케줄(생성·수정·삭제) — [C4] 캘린더 명령 무효화 단일 소스(invalidateCalendarCommand)로 통일.
const useCalendarCommandInvalidator = () => {
  const qc = useQueryClient();
  return () => invalidateCalendarCommand(qc);
};
export const useCreateSchedule = () => {
  const invalidate = useCalendarCommandInvalidator();
  return useMutation({
    mutationFn: api.schedule.create,
    onSuccess: (data) => {
      // [TBO-63] 생성의 역연산 = 삭제(단일 회차만 — 반복 bulk는 스택 제외)
      const id = (data as { row?: { id?: number } })?.row?.id;
      if (id) pushScheduleUndo({ label: "수업 생성 되돌리기(삭제)", run: () => api.schedule.remove(id) });
      return invalidate();
    },
  });
};
export const useCreateScheduleSeries = () => useMutation({ mutationFn: api.schedule.createSeries, onSuccess: useCalendarCommandInvalidator() }); // [C2/C4] 반복 bulk
export const useOpenClass = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.schedule.openClass, onSuccess: () => invalidateClassOpening(queryClient) });
};
export const useOpenClassSeries = () => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.schedule.openClassSeries, onSuccess: () => invalidateClassOpening(queryClient) });
};
// [TBO-79 B4] 파서·프롬프트 타입의 소유는 lib/queries/accounting-ack — 출결 초기화·리포트 반려도
//  같은 흐름을 쓰므로 사본을 만들지 않는다.
export type { AccountingImpactPrompt } from './accounting-ack';
import { accountingPromptFromError, useAccountingAck, type AccountingImpactPrompt } from './accounting-ack';

export const useUpdateSchedule = () => {
  type Variables = { id: number; body: Parameters<typeof api.schedule.update>[1] };
  const [pending, setPending] = useState<{ variables: Variables; prompt: AccountingImpactPrompt } | null>(null);
  const qc = useQueryClient();
  const invalidate = useCalendarCommandInvalidator();
  const mutation = useMutation({
    mutationFn: (v: Variables) => {
      // [TBO-63] before 스냅샷은 요청 직전 캐시에서 — 성공 시 역패치를 스택에 적재.
      (v as Variables & { __undoBefore?: Record<string, unknown> }).__undoBefore = cachedScheduleRow(qc, v.id);
      return api.schedule.update(v.id, v.body);
    },
    onSuccess: (_data, v) => {
      const body = v.body as Record<string, unknown>;
      const before = (v as Variables & { __undoBefore?: Record<string, unknown> }).__undoBefore;
      const scoped = body.scope != null && body.scope !== "this";
      if (before && !scoped) {
        const inverse: Record<string, unknown> = {};
        for (const field of UNDOABLE_FIELDS) if (field in body) inverse[field] = before[field] ?? null;
        if (Object.keys(inverse).length)
          pushScheduleUndo({
            label: "수업 변경 되돌리기",
            // [TBO-66 F2] 실행 직전 서버 fresh 재조회 — 캡처 후 자동 held 전이가 있었으면 status 복원 생략
            run: async () => {
              const fresh = await api.schedule.get(v.id).catch(() => null);
              const safe = sanitizeInversePatch(inverse, (fresh as { status?: string } | null)?.status);
              if (!Object.keys(safe).length) return; // 전부 생략되면 no-op(전이 존중)
              // [74D-0] 맹목 ack 금지 — 1차는 ack 없이 시도, 회계 영향 409면 서버가 준 impactHash로 1회만
              //  결속 재시도(사용자의 명시적 undo = 직전 자신의 변경 복원이라 영향 재확인 모달은 생략).
              try {
                return await api.schedule.update(v.id, { ...safe, force: true } as Variables["body"]);
              } catch (error) {
                const prompt = accountingPromptFromError(error);
                if (!prompt || prompt.payoutLocked || !prompt.impactHash) throw error;
                return api.schedule.update(v.id, {
                  ...safe, force: true,
                  acknowledgeAccountingImpact: true,
                  expectedAccountingImpactHash: prompt.impactHash,
                } as Variables["body"]);
              }
            },
          });
      }
      return invalidate(); // [C4] 단일 무효화 — 시수·정산 미리보기 동시 재계산
    },
  });
  const mutate: typeof mutation.mutate = (variables, options) => mutation.mutate(variables, {
    ...options,
    onError: (error, vars, onMutateResult, context) => {
      const prompt = accountingPromptFromError(error);
      if (prompt) {
        setPending({ variables, prompt });
        return;
      }
      options?.onError?.(error, vars, onMutateResult, context);
    },
  });
  return {
    ...mutation,
    mutate,
    accountingPrompt: pending?.prompt ?? null,
    dismissAccountingPrompt: () => setPending(null),
    confirmAccountingImpact: () => {
      if (!pending) return;
      const { variables, prompt } = pending;
      setPending(null);
      if (!prompt.payoutLocked)
        // [74D-0] ack는 본 영향의 지문과 함께 — 서버가 잠금 후 재계산한 hash와 다르면 새 409(fresh impact)로
        //  이 프롬프트가 다시 열린다(mutate 래퍼의 rememberPrompt가 두 번째 409도 같은 parser로 처리).
        mutate({ ...variables, body: { ...variables.body, acknowledgeAccountingImpact: true, expectedAccountingImpactHash: prompt.impactHash } });
    },
  };
};
export const useRemoveSchedule = () => {
  type Variables = {
    id: number;
    scope?: "this" | "this_and_following" | "all";
    expectedSeriesVersion?: number;
    acknowledgeAccountingImpact?: boolean;
    expectedAccountingImpactHash?: string;
  };
  type Result = Awaited<ReturnType<typeof api.schedule.remove>>;
  const [pending, setPending] = useState<{ variables: Variables; prompt: AccountingImpactPrompt } | null>(null);
  const invalidate = useCalendarCommandInvalidator();
  const mutation = useMutation({
    // [TBO-29C C3] scope/CAS 인자와 TanStack context 인자 충돌 방지 — 명시 래핑
    mutationFn: (vars: Variables) =>
      api.schedule.remove(vars.id, {
        scope: vars.scope,
        expectedSeriesVersion: vars.expectedSeriesVersion,
        acknowledgeAccountingImpact: vars.acknowledgeAccountingImpact,
        expectedAccountingImpactHash: vars.expectedAccountingImpactHash,
      }),
    // 삭제는 출결·보고서·반복 시리즈 메타까지 함께 전이한다. aggregate 스냅샷 없는
    // 단일 세션 restore는 종속 행을 누락하므로 undo 스택에 등록하지 않는다.
    onSuccess: () => invalidate(), // [C4] 단일 무효화
  });
  const rememberPrompt = (error: unknown, variables: Variables): boolean => {
    const prompt = accountingPromptFromError(error);
    if (!prompt) return false;
    setPending({ variables, prompt });
    return true;
  };
  const mutate: typeof mutation.mutate = (variables, options) => mutation.mutate(variables, {
    ...options,
    onError: (error, vars, onMutateResult, context) => {
      if (rememberPrompt(error, vars)) return;
      options?.onError?.(error, vars, onMutateResult, context);
    },
  });
  const mutateAsync: typeof mutation.mutateAsync = async (variables, options) => {
    try {
      return await mutation.mutateAsync(variables, options);
    } catch (error) {
      rememberPrompt(error, variables);
      throw error;
    }
  };
  return {
    ...mutation,
    mutate,
    mutateAsync,
    accountingPrompt: pending?.prompt ?? null,
    dismissAccountingPrompt: () => setPending(null),
    confirmAccountingImpact: (options?: { onSuccess?: (result: Result) => void; onError?: (error: unknown) => void }) => {
      if (!pending) return;
      const { variables, prompt } = pending;
      setPending(null);
      if (prompt.payoutLocked) return;
      mutate(
        {
          ...variables,
          acknowledgeAccountingImpact: true,
          expectedAccountingImpactHash: prompt.impactHash,
        },
        { onSuccess: (result) => options?.onSuccess?.(result), onError: (error) => options?.onError?.(error) },
      );
    },
  };
};

// 수업 요청(TBO-16 #9) — 승인 시 세션이 생기므로 schedule도 무효화(참조 무결성 — 캘린더·배지 동시 갱신)
export const useCreateScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: api.scheduleRequests.create,
    onSuccess: (data) => {
      upsertScheduleRequestCache(qc, scope, data.row);
      return invalidateScheduleRequests(qc);
    },
  });
};
export const useCreateScheduleRequestBulk = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: api.scheduleRequests.createBulk,
    onSuccess: (data) => {
      for (const row of data.rows) upsertScheduleRequestCache(qc, scope, row);
      return invalidateScheduleRequests(qc);
    },
  });
};
export const useApproveScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: {
      id: number;
      forceConflicts?: boolean;
      acknowledgeAccountingImpact?: boolean;
      expectedAccountingImpactHash?: string;
    }) => api.scheduleRequests.approve(v.id, v),
    // [C2C-b] audit 프리픽스 무효화 — 상세 모달 '처리 이력'이 승인 직후 즉시 갱신
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data.request);
      const kind = data.request.requestKind;
      await refreshScheduleRequestLifecycle(qc, {
        schedule: kind == null || kind === "session_create" || kind === "session_update" || kind === "session_delete",
        availability: kind === "availability_upsert" || kind === "availability_delete",
      });
    },
  });
};
export const useRejectScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.scheduleRequests.reject(v.id, v.reason), // 사유 필수
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data);
      await refreshScheduleRequestLifecycle(qc);
    },
  });
};
// [C2C-b 청크2] pending 요청 수정(관리자) — 상세 모달 편집. 승인센터·배지·캘린더 고스트 동시 갱신
export const useUpdateScheduleRequest = () => {
  const qc = useQueryClient();
  const { scope } = useAccountAccess();
  return useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof api.scheduleRequests.update>[1] }) => api.scheduleRequests.update(v.id, v.body),
    onSuccess: async (data) => {
      upsertScheduleRequestCache(qc, scope, data);
      await refreshScheduleRequestLifecycle(qc);
    }, // 이력 즉시 갱신(상세 모달)
  });
};
// 출결(강사 마킹) — session×student upsert
// [TBO-62 ⑤ 2026-07-24] 출결 기록 시 서버가 scheduled→held 자동 전이 — 캘린더·세션 상세 캐시도 무효화.
export const useUpsertAttendance = () => useMutation({ mutationFn: api.attendance.upsert, onSuccess: useInvalidator([qk.attendance.all, qk.schedule.all, qk.payouts.all, qk.audit.all]) }); // [TBO-66 F4] 이력 패널
// [TBO-79 B4] 출결 초기화는 held → scheduled 역전이라 정산 예상액을 바꾼다 — 서버가 영향
//  미리보기와 명시 확인을 요구하므로 수업 수정과 같은 프롬프트 흐름을 쓴다.
type ClearAttendanceVars = {
  sessionId: number;
  studentId: number;
  reason: string;
  acknowledgeAccountingImpact?: boolean;
  expectedAccountingImpactHash?: string;
};
export const useClearAttendance = () => {
  const mutation = useMutation({
    mutationFn: (v: ClearAttendanceVars) =>
      api.attendance.clear(v.sessionId, v.studentId, {
        reason: v.reason,
        acknowledgeAccountingImpact: v.acknowledgeAccountingImpact,
        expectedAccountingImpactHash: v.expectedAccountingImpactHash,
      }),
    onSuccess: useInvalidator([qk.attendance.all, qk.schedule.all, qk.payouts.all, qk.audit.all]),
  });
  return useAccountingAck(mutation, (variables, impactHash) => ({
    ...variables,
    acknowledgeAccountingImpact: true,
    expectedAccountingImpactHash: impactHash,
  }));
};
export type InstructorAttendanceCommandVariables =
  | { kind: "set"; id: number; body: SetInstructorAttendanceInput }
  | { kind: "clear"; id: number; body: ClearInstructorAttendanceInput };

/** 강사 출결 C/U/D의 유일한 frontend command. 일정 PATCH·undo와 분리한다. */
export const useInstructorAttendanceCommand = () => {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: InstructorAttendanceCommandVariables) => variables.kind === "set"
      ? api.schedule.setInstructorAttendance(variables.id, variables.body)
      : api.schedule.clearInstructorAttendance(variables.id, variables.body),
    onSuccess: () => invalidateCalendarCommand(qc),
  });
  const command = useAccountingAck(mutation, (variables, impactHash): InstructorAttendanceCommandVariables =>
    variables.kind === "set"
      ? { kind: "set", id: variables.id, body: { ...variables.body, acknowledgeAccountingImpact: true, expectedAccountingImpactHash: impactHash } }
      : { kind: "clear", id: variables.id, body: { ...variables.body, acknowledgeAccountingImpact: true, expectedAccountingImpactHash: impactHash } });
  return {
    ...command,
    setAttendance: (id: number, status: SetInstructorAttendanceInput["status"]) =>
      command.mutate({ kind: "set", id, body: { status } }),
    clearAttendance: (id: number, reason: string) =>
      command.mutate({ kind: "clear", id, body: { reason } }),
  };
};
