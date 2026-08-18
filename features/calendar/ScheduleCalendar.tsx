"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ScheduleRow, Conflict, ScheduleResource, AvailabilityBlock, Attendance } from "@/types";
// [B6 C4] api 값 import 제거 — 이 화면의 쓰기는 전부 중앙 mutation 훅 경유(타입만 사용).
import type { SchedulePatchBody, ScheduleCreateBody, ScheduleSeriesCreateBody, AvailabilityUpsertBody, CreateScheduleRequestBody } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "@/lib/api-error";
import { acceptAuthoritativeScheduleRows, beginScheduleListCacheTransaction, invalidateScheduleLifecycle, invalidateAvailability, updateScheduleListCache, type ScheduleRowsRollback } from '@/lib/query-cache';
// 시간·요일 유틸은 lib/domain/schedule 단일 소스(감사 D — 파일별 중복 toMin/fromMin/pad/WD 제거)
import { weekDates, weekdayOf, layoutLanes, teachingHours, toMin, fromMin, pad2 as pad, WEEKDAYS_KO as WD, sessionEndMin, crossMidnightEnd, durationMinutesBetween } from "@/lib/domain/schedule";
import { useAcademyEvents } from "@/lib/queries"; // [TBO-29D ⑤] 학원 공통 일정(전 직원 공통 표시)
import { ScheduleCreateModal } from "./ScheduleCreateModal";
import {
  PALETTE, STATUS_LABEL,
  rowInResource, cloneSessionBody,
  type SplitDim, type ListGroupBy, type PasteTarget, densityOf, expandAxis,
  matchesCalendarFacetFilters,
  type CalendarFacetFilters } from "@/lib/domain/lantiv";
import {
  useAttendance,
  useScheduleRequests,
  useCalendarSchedule,
  useRooms,
  useScheduleResources,
  useAllAvailability,
  useCreateScheduleRequest,
  useCreateScheduleRequestBulk,
  // [B6 C4/EP9] 관리자 직접 쓰기도 중앙 mutation 훅으로 — 수동 api.* + 수동 무효화 잔재 제거.
  //  훅 onSuccess가 무효화(스케줄=캘린더 명령 7-scope, 가용=availability만)를 담당하므로
  //  성공 직후의 명시 load()/reloadSelBlocks()는 제거했다(이중 refetch 방지).
  useCreateSchedule,
  useCreateHistoricalCompletedSchedule,
  useCreateScheduleSeries,
  useUpdateSchedule,
  useRemoveSchedule,
  useUpsertAvailability,
  useRemoveAvailability,
} from "@/lib/queries";
// 국가·시차(피드백 2026-07-02): KST 단일 진실원 → 표시 전용 변환(lib/domain/tz), 비KST 뷰는 편집 잠금
import { COUNTRIES, KST_TZ, countryByCode, shiftRowsToTz, tzOffsetFromKst, tzLocalToKst, kstBlockToTzWindow, kstPatchTimes, type CountryInfo, type TzShiftedRow } from "@/lib/domain/tz";
import { CountryInput } from "./CountryInput";
import { formatScheduleConflicts } from "@/lib/domain/conflict-messages";
import { applyScheduleRowPatch } from "@/lib/domain/schedule-row";
import { scopeCalendarRowsToInstructor } from "@/lib/domain/calendar-access";
import { calendarScheduleCourses, calendarSubjectOptions } from "@/lib/domain/schedule-resources";
import {
  calendarPaneColumnLabel,
  calendarPaneDates,
  calendarPanePeriodLabel,
  calendarPanesFetchRange,
  calendarPanesReducer,
  createCalendarRowsByPaneSelector,
  createCalendarPanesState,
  type CalendarPaneState,
  type CalendarPanesState,
} from "@/lib/domain/calendar-panes";
import { availabilityGhostBandsForColumn } from "@/lib/domain/pending-ghosts";
import {
  buildAvailabilityRequestBody,
  buildSessionCreateRequestBatch,
  buildSessionCreateRequestBody,
  buildSessionDeleteRequestBody,
} from "@/lib/domain/request-drafts";
import { calendarExportFilename, resolveExportPeople } from "@/lib/domain/calendar-export";
import { AVAILABILITY_KIND_LABEL } from "@/lib/domain/approvals";
import { axisCompanionTimezone, resourceTimezoneKey, type ResourceTimezoneOverrides } from "@/lib/domain/resource-timezone";
import { exportNodeAsImage } from "@/lib/export";
import { usePersistedState } from "@/lib/usePersistedState";
import { enumPreferenceCodec, preferenceKeys } from "@/lib/storage/preferences";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { ResourcePanel } from "./ResourcePanel";
import { ResourceDetailCard } from "./ResourceDetailCard";
import { ParticipantsCard } from "./ParticipantsCard";
import { CalendarPane } from "./CalendarPane";
import { ConfirmModal, HelpPopover, PageHeader } from "@/components/ui";
import { AccountingImpactModal } from "@/components/AccountingImpactModal";
// [B6 C1 2026-07-16] 인라인 사설 모달 6종 → ModalShell 계열로 이관·파일 분리(E1 + EP9 선행 절단).
//  window.confirm/alert 잔재도 ConfirmModal·인라인 배너로 전면 치환(신규 네이티브 다이얼로그 금지).
import {
  AvailabilityApprovalModal,
  ScheduleChangeApprovalModal,
  ScheduleDeleteApprovalModal,
  type AvailabilityApprovalDraft,
  type AvailabilityImpact,
  type ScheduleChangeApprovalDraft,
  type ScheduleDeleteApprovalDraft,
} from "./modals/ApprovalRequestModals";
import { BlockEditModal } from "./modals/BlockEditModal";
import { UndoHotkey } from './UndoHotkey'; // [TBO-63] cmd/ctrl+Z
import { SessionDetailModal } from "./modals/SessionDetailModal";
import { RecurrencePrompt } from "./modals/RecurrencePrompt";
import { SessionListPanel } from "./SessionListPanel";
import { SessionDetailPanel } from "./SessionDetailPanel";
import type {
  AvailabilityImpactConflict,
  RecurrenceScope,
  SessionAccountingImpactConflict,
} from "@kms545487/contracts";
import { useAutoClear, useElementWidth, useMounted, useWindowKeydown } from "@/lib/hooks/browser-sync";
import { EventForm } from "@/features/admin/EventsView"; // [B5] 학원 일정 인라인 발행 — 단일 폼 재사용
import type { CalendarCompareSelection } from "@/lib/navigation-security";
import { calendarMinuteAtPointer, calendarRangeBetween, type CalendarMinuteRange } from "@/lib/domain/calendar-range";

// [TBO-69 C4] 그리드 상수·순수 헬퍼·상호작용 타입은 calendar-grid.ts로 분리(본문 이동 — 값 무변).
import {
  START_H, END_H, HOUR_H, SNAP, HEADER_H, GUTTER_W, GRID_MIN, CANCELED_GRAY,
  INSTRUCTOR_RESOURCE_FILTER_DIMS, INSTRUCTOR_SPLIT_DIMS, INSTRUCTOR_RESOURCE_PANEL_TYPES,
  isCanceledStatus, isSessionCanceled, snap, tzCellToKst, clampToAxis, clampMin, todayISO,
  mondayOf, hashColor, startMinOf, endMinOf,
  type ColorBy, type Resizing, type Pending,
  type AccountingImpact, type AccountingAck, type ConfirmRequest, type AvailabilityApprovalSeed,
} from "./calendar-grid";
import { addDaysISO } from "@/lib/format"; // [TBO-69 C4] 정본 소비(사본 제거)

const EMPTY_SCHEDULE_ROWS: ScheduleRow[] = [];

function initializeCalendarPanes(selection: CalendarCompareSelection | null): CalendarPanesState {
  let state = createCalendarPanesState(selection?.from ?? todayISO());
  if (!selection) return state;
  state = calendarPanesReducer(state, {
    type: "pane/set-range",
    paneId: state.activePaneId,
    anchorDate: selection.from,
    currentDate: selection.to,
  });
  return calendarPanesReducer(state, {
    type: "pane/set-resource-filter",
    paneId: state.activePaneId,
    filter: "instructorIds",
    values: selection.instructorIds,
  });
}

export function ScheduleCalendar({ initialSelection = null }: { initialSelection?: CalendarCompareSelection | null }) {
  const [calendarPanesState, dispatchCalendarPanes] = useReducer(
    calendarPanesReducer,
    initialSelection,
    initializeCalendarPanes,
  );
  const activeCalendarPane = calendarPanesState.panes.find((pane) => pane.id === calendarPanesState.activePaneId)
    ?? calendarPanesState.panes[0];
  const activeCalendarDates = useMemo(() => calendarPaneDates(activeCalendarPane), [activeCalendarPane]);
  // [TBO-21 B2] 현재시각선은 new Date()를 렌더 중 계산 → SSR HTML과 클라 하이드레이션 시각이 달라
  //  React #418(hydration text mismatch)이 났다. mount 후에만 렌더해 서버·클라 첫 렌더를 일치시킴.
  const mounted = useMounted();
  const { data: rooms = [] } = useRooms(); // [TBO-14 C2] 강의실 카탈로그 = Query(로컬 state·1회 fetch 대체)
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  // [이슈1] 편집 대상이 비KST 컬럼(현지 시각 표시)이면 그 tz — 저장 시 현지→KST 역변환 기준. KST면 null.
  const [editingTz, setEditingTz] = useState<CountryInfo | null>(null);
  const openEditor = useCallback((r: ScheduleRow, tz: CountryInfo | null = null) => { setEditing(r); setEditingTz(tz); }, []);
  const [selEvent, setSelEvent] = useState<number | null>(null); // 단일 클릭 선택(애플식 — 리사이즈 핸들 노출)
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ row: ScheduleRow } | null>(null); // [C3] 반복 삭제 scope 선택
  const [accountingAck, setAccountingAck] = useState<AccountingAck | null>(null);
  // [오류5 2026-07-06] 리사이즈 미리보기 — start/end는 드래그 중인 컬럼의 "현지 분"(커밋용),
  //  dStart/dEnd는 프레임 불변 델타(±분). 다른 시차 컬럼(같은 세션)은 자기 좌표 + 델타로 그려
  //  시차 표에서도 미리보기가 그 나라 시간 기준으로 정확히 보인다(종전: 현지 분을 그대로 적용해 KST 표기 오염).
  const [preview, setPreview] = useState<{ id: number; start: number; end: number; dStart: number; dEnd: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [scheduleChangeApproval, setScheduleChangeApproval] = useState<ScheduleChangeApprovalDraft | null>(null);
  const [scheduleDeleteApproval, setScheduleDeleteApproval] = useState<ScheduleDeleteApprovalDraft | null>(null);
  const [availabilityApproval, setAvailabilityApproval] = useState<AvailabilityApprovalDraft | null>(null);
  // [B6 C1] window.confirm 대체 상태 — 충돌 강행/삭제 확인을 ConfirmModal로. 낙관 상태는 모달 결정 대기
  //  중 유지하지 않는다(먼저 롤백 → 확인 시 재적용) — 동기 confirm과 달리 대기 중 렌더가 계속되기 때문.
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  useAutoClear(msg, setMsg, "", 3500);

  // ── 자원(레일)·가용 ──
  const { data: resources = null } = useScheduleResources(); // [TBO-14 C2] 자원 피커 = Query(로컬 state·effect 대체)
  // [A안 통합 2026-07-03] "유저별 스케줄"과 상단 필터바 = **단일 선택 모델**.
  //  이전엔 selected(서버 파라미터)와 필터바(클라 필터)가 독립이라 겹치면 암묵적 교집합이 됐음.
  //  이제 selected는 별도 상태가 아니라 **필터에서 파생**: 리소스 선택 합계가 정확히 1명이면
  //  그 유저 = 개인 모드(서버 파라미터 조회·가용밴드·상세 카드·PNG 이름). 필터바 칩에 항상 표시되어
  //  "지금 무엇으로 걸러져 있는지"가 한 곳에 보인다. 우측 패널 클릭 = 그 차원 필터를 1명으로 세팅.
  // (selected 정의는 필터 상태 아래 — 파생 useMemo)
  // [TBO-14 C2b] 가용/불가 = TanStack Query 단일 소스(allBlocks). selBlocks(선택 유저)는 selected 정의 후 owner 파생.
  //  밴드 편집(upsert/remove)은 reloadSelBlocks=invalidate(qk.availability.all)로 refetch→파생 자동 재계산.
  const { data: allBlocks = [] } = useAllAvailability();

  // 이미지(PNG/JPEG) 내보내기
  const captureRef = useRef<HTMLDivElement>(null);
  const [busyImg, setBusyImg] = useState(false);

  // 권한은 AppShell의 `/auth/me` 검증 계정에서만 파생한다. 실제 쓰기 허용은 백엔드가 최종 판정한다.
  const qc = useQueryClient(); // [TBO-16] 요청 생성 후 scheduleRequests 무효화(배지·승인센터 동일 모집단)
  const createScheduleRequest = useCreateScheduleRequest();
  const createScheduleRequestBulk = useCreateScheduleRequestBulk();
  // [B6 C4] 중앙 mutation 훅 — mutateAsync와 bounded Query-cache snapshot/rollback을 함께 사용한다.
  //  쓰기 경로와 무효화는 공용 계층으로 통일. useUpdateSchedule의 accountingPrompt 인터셉트는 mutate
  //  전용이라 mutateAsync엔 안 걸림 — 이 화면은 409 회계영향을 자체 모달(accountingAck)로 처리한다.
  const createScheduleM = useCreateSchedule();
  const createHistoricalCompletedM = useCreateHistoricalCompletedSchedule();
  const createScheduleSeriesM = useCreateScheduleSeries();
  const updateScheduleM = useUpdateSchedule();
  const removeScheduleM = useRemoveSchedule();
  const upsertAvailabilityM = useUpsertAvailability();
  const removeAvailabilityM = useRemoveAvailability();
  // [B-4] 내 수업 요청(강사) — 배지·승인센터와 같은 useScheduleRequests 단일 queryKey 구독
  const { data: myRequests = [] } = useScheduleRequests();
  const pendingGhosts = useMemo(() => myRequests.filter((r) => r.status === "pending"), [myRequests]);
  const access = useAccountAccess();
  const canManage = access.can("calendar.manage");
  const [showEventForm, setShowEventForm] = useState(false); // [B5] 학원 일정 인라인 발행 토글
  // [TBO-87] 겸직(강사+매니저) — instructor.self는 겸직 매니저에도 참(roles 합성)이므로, 캘린더의
  //  "강사 제한 모드"(본인 스코프 강제·요청 흐름·스플릿 차원 제한)는 관리 권한이 없는 순수 강사에만
  //  적용한다(BE isInstructorOnly 동형 — 겸직은 합성이지 축소가 아니다). 겸직 매니저는 매니저 전체
  //  캘린더를 유지하고, 본인 세션 어포던스(인라인 리포트 게이트 등)만 myInstructorId로 추가된다.
  const isInstructor = access.can("instructor.self") && !canManage;
  const instructorRequestMode = isInstructor;
  const myInstructorId = access.instructorId ?? undefined;
  // 본인 스코프 클라 방어는 제한 모드에서만 — 겸직 매니저에 걸면 전체 뷰가 본인 수업만으로 준다.
  const scopeInstructorId = isInstructor ? myInstructorId : undefined;
  const canAdd = canManage || (isInstructor && myInstructorId != null);
  // start가 있으면 그 시각으로 프리필(빈 곳 더블클릭 — 피드백 2026-07-02 #4).
  // [유저별 추가 2026-07-03] 전역 "+ 스케줄 추가"(현행)와 별개로, 스플릿 컬럼(유저)에서 그 유저
  //  프리필로 추가 — owner(가용/불가 소유자)·defaultInstructorId(세션 강사) 프리필.
  const [creating, setCreating] = useState<{
    date: string; start?: string; end?: string;
    owner?: ScheduleResource | null; defaultInstructorId?: number;
    tz?: CountryInfo | null; // [이슈1] 비KST 컬럼에서 추가 시 — 입력은 현지 시각, 저장 시 KST 역변환
  } | null>(null);

  type EmptyRangeDraft = CalendarMinuteRange & {
    colKey: string;
    date: string;
  };
  const [emptyRangeDraft, setEmptyRangeDraft] = useState<EmptyRangeDraft | null>(null);
  const emptyRangeRef = useRef<{
    pointerId: number;
    startClientY: number;
    moved: boolean;
    rectTop: number;
    anchorMin: number;
    gridMin: number;
    gridMax: number;
    range: CalendarMinuteRange;
    col: Col;
    tz?: CountryInfo | null;
  } | null>(null);
  const suppressEmptyClickRef = useRef(false);

  // ── 필터(Lantiv형) ──
  const [colorBy, setColorBy] = usePersistedState<ColorBy>(
    preferenceKeys.calendarColorBy,
    "subject",
    enumPreferenceCodec<ColorBy>(["subject", "instructor", "room", "student"]),
  );
  const mainRef = useRef<HTMLDivElement>(null);
  const mainW = useElementWidth(mainRef, 1100);
  // 우측 패널: 리스트에서 클릭한 세션(아래 상세) + 그룹 토글
  const [detailId, setDetailId] = useState<number | null>(null);
  const [listGrouped, setListGrouped] = useState(false);

  // ── 복제(Lantiv, 피드백 2026-07-02): 빈 셀 클릭=커서(시각 표시) · Ctrl+C/V · Ctrl+드래그 ──
  // 커서 = 붙여넣기 대상(시작시각). 클립보드는 세션 스냅샷(로컬 상태 — OS 클립보드 아님).
  const [cursor, setCursor] = useState<PasteTarget & { colKey: string; tz?: string } | null>(null); // [이슈2] tz=현지 좌표 표시·붙여넣기 변환
  const [clip, setClip] = useState<ScheduleRow | null>(null);

  // ── 국가·시차 뷰(피드백 2026-07-02) ──
  //  country: 전역 — 선택 시 ① 그 국가 학생 세션만 필터 ② 그리드를 그 국가 로컬 시간으로 표시(KST→변환).
  //  paneCountry: 표(스플릿)별 override — 강사 표는 KST, 학생 표는 미국 시간처럼 표마다 다르게.
  //  저장은 항상 KST(단일 진실원). [개방 2026-07-06] 비KST 컬럼도 드래그·리사이즈·생성·복제 전부 허용 —
  //  커밋 직전 tzCellToKst(R-1b DST 2-패스)로 KST 변환(익일 연속 블록만 표시 전용 유지).
  // 학생 국가·수강·코스·과목은 역할별 `/schedule/resources` 한 query에서만 파생한다.
  // 강사 캘린더가 전역 courses/subjects/enrollments/students cache를 읽지 않으므로 모든 UI 축이 같은 scope다.
  const allCourses = useMemo(() => calendarScheduleCourses(resources), [resources]);
  const subjectOpts = useMemo(() => calendarSubjectOptions(resources), [resources]);
  const subjectIdOf = useMemo(() => {
    const m = new Map(allCourses.map((c) => [Number(c.id), c.subjectId != null ? Number(c.subjectId) : undefined]));
    return (courseId: number) => m.get(courseId);
  }, [allCourses]);
  // [KST 고정 축 2026-07-07] on=모든 컬럼을 KST 위치로 그림(같은 가로선=같은 실제 순간, 비교 최적).
  //  해외 컬럼은 칩에 현지시각 병기. off=컬럼별 현지 시각(자연스러움). 시차 편집·변환은 off일 때만.
  // 서비스 시간축 계약은 항상 KST다. 사용자/프리셋 상태로 다시 끌어내리지 않는다.
  const kstFixed = true;
  const [resourceTzOverride, setResourceTzOverride] = useState<ResourceTimezoneOverrides>({});
  // [오류4 2026-07-06] x/y = 국기 버튼 뷰포트 좌표 — 팝오버를 fixed로 띄워 컬럼 overflow-hidden
  //  클리핑·옆 컬럼 가림에서 탈출(항상 최상위). 클릭 시점 좌표 고정(스크롤 시 재클릭).
  const [tzPickerFor, setTzPickerFor] = useState<{ colKey: string; type: Exclude<SplitDim, "subject">; id: number; x: number; y: number } | null>(null);

  // [감사 M4] 시차 변환 결과 캐시 — filtered가 바뀔 때만 초기화, 같은 렌더/리렌더에서 tz별 1회만 변환.
  const tzRowsCacheRef = useRef<{ src: ScheduleRow[] | null; map: Map<string, ScheduleRow[]> }>({ src: null, map: new Map() });
  // 낙관 생성 row는 서버의 양수 id와 충돌하지 않는 component-local 단조 감소 id를 사용한다.
  // Date.now()는 series map 한 tick에서 중복될 수 있으므로 사용하지 않는다.
  const optimisticRowIdRef = useRef(0);

  // 학생 출결(GET /attendance) — 상태 필터(지각/결강)의 학생 축. 세션id → 출결행 조인.
  const { data: attendanceRows = [] } = useAttendance();
  const attBySession = useMemo(() => {
    const m = new Map<number, Attendance[]>();
    for (const a of attendanceRows) {
      const k = Number(a.sessionId);
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [attendanceRows]);

  const resizingRef = useRef<Resizing | null>(null);
  const previewRef = useRef<{ id: number; start: number; end: number; dStart: number; dEnd: number } | null>(null);

  // [TBO-29D ⑤] 학원 공통 일정(입시 설명회·모의고사·휴원 등) — 역할 무관 전 직원에게 표시.
  const { data: academyEvents = [] } = useAcademyEvents();
  // [A안] 파생 selected: 리소스 필터 합계가 정확히 1명일 때 그 유저 = 개인 모드.
  //  (필터바 어떤 경로로든 1명만 남으면 자동으로 개인 스케줄 혜택 — 밴드·상세 카드·서버 파라미터)
  const selected: ScheduleResource | null = useMemo(() => {
    if (!resources) return null;
    const { instructorIds, studentIds, roomIds } = activeCalendarPane.filters;
    const total = instructorIds.length + studentIds.length + roomIds.length;
    if (total === 0 && isInstructor && myInstructorId != null) {
      return resources.instructors.find((resource) => Number(resource.id) === myInstructorId) ?? null;
    }
    if (total !== 1) return null;
    if (instructorIds.length === 1) {
      const id = instructorIds[0];
      return resources.instructors.find((r) => Number(r.id) === id) ?? null;
    }
    if (studentIds.length === 1) {
      const id = studentIds[0];
      return resources.students.find((r) => Number(r.id) === id) ?? null;
    }
    const id = roomIds[0];
    return resources.rooms.find((r) => Number(r.id) === id) ?? null;
  }, [activeCalendarPane.filters, isInstructor, myInstructorId, resources]);

  // [TBO-14 C2b] 선택 자원의 불가/가용 블록 = allBlocks에서 owner 파생(단일 소스 — 별도 fetch 제거).
  //  api.availability.list(type,id)와 동치(백엔드 list=all의 owner 필터). 밴드 편집→invalidate→allBlocks 재조회→자동 재계산.
  const selBlocks = useMemo(
    () => (selected ? allBlocks.filter((b) => b.ownerType === selected.type && Number(b.ownerId) === Number(selected.id)) : []),
    [allBlocks, selected],
  );

  // [A안 조정 2026-07-03] 유저 클릭 = **정보 카드만**(캘린더 뷰·필터 불변 — "뷰가 바뀌면 안 됨" 피드백).
  //  개인 필터 적용은 카드의 "이 유저 스케줄만 보기" 버튼으로 명시적으로만.
  const [infoTarget, setInfoTarget] = useState<ScheduleResource | null>(null);
  const cardTarget = infoTarget ?? selected; // 카드 표시 대상: 명시 선택 > 파생 개인 모드(필터 1명)

  // [TBO-14] 스케줄 데이터층 = TanStack Query 단일 소스(useCalendarSchedule). 기간만 query key를 바꾼다.
  //  · 낙관적 편집도 현재 bounded list cache를 직접 patch/rollback하므로 별도 local rows 사본이 없다.
  //  · 세션 변경(PATCH/생성/삭제·강사출결)은 schedule root 무효화 → 같은 cache가 서버 값으로 수렴한다.
  //    → 출석부/상세에서 강사 출결을 바꿔도 캘린더가 자동 갱신(M1 invalidate 단절 근본 해소).
  const paneFetchRange = useMemo(() => {
    return calendarPanesFetchRange(calendarPanesState);
  }, [calendarPanesState]);
  // Pane resource selection is a client-side intersection over one bounded population.
  // Never narrow the server query to a selected resource: adding/splitting a pane must not
  // require a second resource-shaped cache or hide rows needed by another pane.
  const scheduleQ = useCalendarSchedule(paneFetchRange, { keepPreviousData: true });
  const scheduleRows = scheduleQ.data ?? EMPTY_SCHEDULE_ROWS;
  const rows = useMemo(
    () => scopeCalendarRowsToInstructor(scheduleRows, scopeInstructorId),
    [scheduleRows, scopeInstructorId],
  );
  const beginRowsTransaction = useCallback(
    (apply: (current: ScheduleRow[]) => ScheduleRow[], rollback: ScheduleRowsRollback) =>
      beginScheduleListCacheTransaction(qc, paneFetchRange, access.scope, apply, rollback),
    [access.scope, paneFetchRange, qc],
  );
  const updateRows = useCallback(
    (update: ScheduleRow[] | ((current: ScheduleRow[]) => ScheduleRow[])) =>
      updateScheduleListCache(qc, paneFetchRange, access.scope, update),
    [access.scope, paneFetchRange, qc],
  );
  const acceptAuthoritativeRows = useCallback((removeIds: readonly number[], authoritative: readonly ScheduleRow[]) => {
    updateRows((current) => acceptAuthoritativeScheduleRows(current, paneFetchRange, removeIds, authoritative));
  }, [paneFetchRange, updateRows]);
  const scheduleCacheReady = !scheduleQ.isPlaceholderData;
  const requireScheduleCacheReady = () => {
    if (scheduleCacheReady) return true;
    setMsg("변경한 기간의 수업을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
    return false;
  };
  useEffect(() => {
    if (scheduleQ.isError) setMsg("백엔드 API에 연결할 수 없습니다. 서버 상태를 확인하세요.");
  }, [scheduleQ.isError]);
  // load() = 스케줄 쿼리 무효화. 낙관적 cache commit 후 서버 확정 또는 stale command 복구에 사용.
  const load = useCallback(async () => {
    await invalidateScheduleLifecycle(qc);
  }, [qc]);
  // [TBO-14 C2] rooms·resources는 useRooms()·useScheduleResources() Query로 이관 — 로컬 fetch effect 제거.

  // [TBO-14 C2b] selBlocks fetch effect 제거 — 위 selBlocks useMemo가 allBlocks에서 파생(단일 소스).

  // ── 색/라벨 ──
  const colorOf = useCallback(
    (r: ScheduleRow) =>
      isSessionCanceled(r) // 결강·취소·강사결석 → 회색(시수 미측정·충돌 제외 시각화)
        ? CANCELED_GRAY
        : colorBy === "subject"
          ? (r.color ?? hashColor(r.subjectName))
          : colorBy === "instructor"
            ? (r.instructorId == null ? hashColor("배정중") : PALETTE[r.instructorId % PALETTE.length])
            : colorBy === "room"
              ? (rooms.find((x) => x.id === r.roomId)?.color ?? hashColor(r.roomName ?? "—"))
              : hashColor((r.studentNames ?? []).join(",") || "—"),
    [colorBy, rooms],
  );
  const labelOf = useCallback(
    (r: ScheduleRow) =>
      colorBy === "subject"
        ? r.courseName
        : colorBy === "instructor"
          ? (r.instructorName ?? "배정중")
          : colorBy === "room"
            ? (r.roomName ?? "—")
            : (r.studentNames ?? []).join(", ") || r.courseName,
    [colorBy],
  );

  // ── 필터 적용 ──
  const selectCalendarRowsByPane = useMemo(createCalendarRowsByPaneSelector, []);
  const calendarRowsByPane = useMemo(
    () => selectCalendarRowsByPane(rows, calendarPanesState.panes, {
      attendanceBySession: attBySession,
      subjectIdOf,
    }),
    [selectCalendarRowsByPane, rows, calendarPanesState.panes, attBySession, subjectIdOf],
  );
  const activeCalendarRows = calendarRowsByPane.get(activeCalendarPane.id) ?? EMPTY_SCHEDULE_ROWS;
  // 컬럼: 데일리 스플릿=(날짜×리소스, 표별 prefix로 key 유일) · week=날짜 · day=강의실
  type Col = {
    key: string; label: string; sub?: string; date: string; roomId?: number;
    noRoom?: boolean; // 일간 '미지정' 컬럼(강의실 없는 세션)
    resType?: SplitDim; resId?: number; firstOfDate?: boolean;
    tzc?: CountryInfo; // owner 개별 시차(country/timeZone 파생 — 학생·강사 공통)
  };
  const columnsForCalendarPane = useCallback((pane: CalendarPaneState): Col[] =>
    calendarPaneDates(pane).map((date) => ({
      key: `${pane.id}:${date}`,
      label: calendarPaneColumnLabel(date),
      date,
    })), []);
  const rowsOfColumn = (c: Col, src: ScheduleRow[]) =>
    src.filter(
      (r) =>
        r.sessionDate === c.date &&
        (c.resType != null
          ? rowInResource(r, c.resType, c.resId!, subjectIdOf) // [#2] 과목 컬럼은 리졸버로 매칭
          : c.noRoom
            ? r.roomId == null // [L1] 미지정 컬럼 = 강의실 없는 세션만
            : c.roomId == null || r.roomId === c.roomId),
    );

  // 가용/불가(Block) 밴드 — 선택 자원 기준. week=요일 매칭 모든 컬럼, day=룸이면 해당 컬럼만/그 외 전체.
  type Band = { id: number; kind: AvailabilityBlock["kind"] | "online_only"; startMin: number; endMin: number; top: number; h: number; editable: boolean };
  // gridMin: 렌더 그리드의 시작 분(개별 시차로 축이 0~24h일 때 top 정합 — renderTimeGrid가 전달)
  // tz: 컬럼이 비KST(해외 학생 등)면 그 tz — KST 블록을 그 나라 로컬로 변환해 표시(이슈1). KST·tz 모두
  //  kstBlockToTzWindow 단일 함수로 매칭·변환(세션 엔진 재사용·단위테스트 — 이슈3).
  const bandsOfColumn = (c: { date: string; roomId?: number; resType?: SplitDim; resId?: number }, gridMin: number = GRID_MIN, gridMax: number = END_H * 60, tz?: string | null): Band[] => {
    const isTz = !!tz && tz !== KST_TZ;
    // [버그수정 2026-07-06 2단] KST 클램프를 상수 축(8~22)이 아닌 **이 그리드의 실제 축**으로 —
    //  expandAxis로 축을 늘려도 여기서 상수로 클램프되면 심야 밴드가 0높이→미렌더되던 원인.
    const axisClamp = isTz ? (mm: number) => Math.max(0, Math.min(24 * 60, mm)) : (mm: number) => clampToAxis(mm, gridMin, gridMax);
    // 블록 1건 → 밴드(그 컬럼 날짜에 안 걸리면 null). tz면 표시 전용(editable=false — 드래그는 KST 좌표라).
    const toBand = (b: AvailabilityBlock, editable: boolean): Band | null => {
      const w = kstBlockToTzWindow(b, c.date, tz ?? KST_TZ);
      if (!w) return null;
      const sMin = axisClamp(w.startMin), eMin = axisClamp(w.endMin);
      if (eMin <= sMin) return null;
      return { id: b.id, kind: b.kind, startMin: sMin, endMin: eMin, top: ((sMin - gridMin) / 60) * HOUR_H, h: Math.max(6, ((eMin - sMin) / 60) * HOUR_H), editable: editable && !isTz };
    };
    const nonNull = (x: Band | null): x is Band => x != null;
    // 스플릿 서브컬럼 = 그 컬럼 유저의 가용·불가 · 비스플릿 = 선택 유저(selBlocks).
    if (c.resType != null && c.resId != null) {
      if (c.resType === "subject") return [];
      return allBlocks
        .filter((b) => b.ownerType === c.resType && Number(b.ownerId) === c.resId)
        .map((b) => toBand(b, true)).filter(nonNull);
    }
    if (!selBlocks.length) return [];
    return selBlocks
      .filter(() => selected?.type !== "room" || c.roomId == null || c.roomId === selected.id)
      .map((b) => toBand(b, true)).filter(nonNull);
  };

  // ── 가용/불가(Block) — 밴드 표시 + 클릭 삭제. 생성은 "스케줄 추가" 모달의 '가용·불가' 탭에서. ──
  // [TBO-14 C2b] 밴드 편집 후 가용/불가 쿼리 무효화 → allBlocks refetch → selBlocks 파생 자동 재계산.
  const reloadSelBlocks = useCallback(async () => {
    await invalidateAvailability(qc); // [P2 FE-9] 중앙 헬퍼(query-cache) — 인라인 queryKey 지식 제거
  }, [qc]);

  const hasAvailabilityLegend = useMemo(() => {
    if (selected) return selBlocks.length > 0;
    const hasOwnerBlocks = (dim: SplitDim, ids: number[]) =>
      dim !== "subject" && ids.some((id) => allBlocks.some((b) => b.ownerType === dim && Number(b.ownerId) === id));
    return calendarPanesState.panes.some((pane) =>
      hasOwnerBlocks("instructor", pane.filters.instructorIds)
      || hasOwnerBlocks("student", pane.filters.studentIds)
      || hasOwnerBlocks("room", pane.filters.roomIds));
  }, [allBlocks, calendarPanesState.panes, selected, selBlocks]);

  function approvalImpactOf(e: unknown): AvailabilityImpact[] | null {
    const data = (e as { response?: { data?: Partial<AvailabilityImpactConflict> } })?.response?.data;
    return data?.approvalRequired ? (data.impactedSessions ?? []) : null;
  }

  function availabilitySummary(body: AvailabilityUpsertBody): string {
    return `${AVAILABILITY_KIND_LABEL[body.kind ?? "available"]} · ${WD[body.weekday]} ${body.startTime}~${body.endTime}`;
  }

  // [B6 C1] window.alert 제거 — 오류는 상단 인라인 배너(msg)로. 모달이 떠 있는 동안의 실패는
  //  createBlock 반환값(message)을 통해 모달 안 인라인 에러로도 표시된다(이중 채널).
  function alertAvailabilityError(message: string) {
    setMsg(message);
  }

  function openAvailabilityApprovalFromError(e: unknown, draft: AvailabilityApprovalSeed): boolean {
    const impacted = approvalImpactOf(e);
    if (!impacted) return false;
    setAvailabilityApproval({ ...draft, impacted } as AvailabilityApprovalDraft);
    setMsg("이미 잡힌 수업에 영향이 있어 승인 요청이 필요합니다.");
    return true;
  }

  async function submitAvailabilityApproval(draft: AvailabilityApprovalDraft, requestReason: string) {
    const input: CreateScheduleRequestBody = buildAvailabilityRequestBody(draft, requestReason);
    try {
      await createScheduleRequest.mutateAsync(input);
      setAvailabilityApproval(null);
      setCreating(null);
      reloadSelBlocks();
      setMsg("승인 요청을 보냈습니다 — 승인센터에서 처리됩니다.");
    } catch (e) {
      const detail = apiErrorMessage(e, ""); // [75A] SSOT 파싱 수렴
      alertAvailabilityError(`요청 실패${detail ? ` — ${detail}` : ""}`);
    }
  }

  // 가용/불가 블록 생성(모달에서 호출) — [B6 C1] 반환을 {ok, message?}로 확장: alert 제거 후에도
  //  생성 모달이 열려 있는 동안 실패 사유를 모달 안 인라인 에러로 표시할 수 있도록(승인 전환 시 message 없음).
  async function createBlock(body: AvailabilityUpsertBody, options: { closeOnSuccess?: boolean } = {}): Promise<{ ok: boolean; message?: string }> {
    try {
      // [B6 C4] 훅 onSuccess가 invalidate(qk.availability.all) — allBlocks refetch → 전체 컬럼·선택
      //  유저 밴드 동시 갱신(버그수정 2026-07-03 이슈3·4의 "항상 갱신" 규약을 훅이 승계).
      await upsertAvailabilityM.mutateAsync(body);
      if (options.closeOnSuccess !== false) setCreating(null);
      return { ok: true };
    } catch (e) {
      if (openAvailabilityApprovalFromError(e, { action: "upsert", body, summary: availabilitySummary(body) })) return { ok: false };
      // 겹침(409) 등 백엔드 메시지를 그대로 노출 — "이미 지정된 불가시간과 겹칩니다" 경고.
      const message = apiErrorMessage(e, "가용/불가 저장 실패"); // [75A]
      alertAvailabilityError(message);
      return { ok: false, message };
    }
  }
  // [스플릿 자체 편집 2026-07-03] 블록 조회는 전체(allBlocks) 우선 — 어느 컬럼의 밴드든 동일 편집 체인.
  //  owner는 블록 자신(ownerType/ownerId)이 보유하므로 selected 의존 제거(일반화).
  const findBlock = (id: number) => allBlocks.find((x) => x.id === id) ?? selBlocks.find((x) => x.id === id);

  // 반복 블록은 삭제 범위를 물어봄(단일 주 블록·범위 없으면 바로 삭제).
  async function deleteBlock(id: number, weekDate?: string) {
    const b = findBlock(id);
    const singleWeek = !!(b?.effectiveFrom && b.effectiveFrom === b.effectiveTo);
    if (b && weekDate && !singleWeek) { setBlockDelScope({ id, kind: b.kind, date: weekDate }); return; }
    setConfirmReq({
      title: "시간 블록 삭제", message: "이 시간 블록을 삭제할까요?", confirmLabel: "삭제", danger: true,
      onConfirm: async () => {
        try { await removeAvailabilityM.mutateAsync(id); } catch (e) {
          if (openAvailabilityApprovalFromError(e, { action: "delete", targetAvailabilityId: id, summary: `${AVAILABILITY_KIND_LABEL[b?.kind ?? "available"]} 삭제` })) return;
          alertAvailabilityError("삭제 실패");
        }
      },
    });
  }
  // 삭제 범위 적용: 전체=행 삭제 · 이후=이번 주 직전까지로 컷 · 이번 주만=원본 분할(이번 주만 제거).
  async function applyBlockDeleteScope(scope: "this" | "this_and_following" | "all") {
    const c = blockDelScope; setBlockDelScope(null);
    if (!c) return;
    const orig = findBlock(c.id);
    const owner = orig
      ? ({ ownerType: orig.ownerType, ownerId: Number(orig.ownerId) } as const)
      : ({ ownerType: "instructor", ownerId: 0 } as const); // orig 없으면 아래 remove 경로만 수행
    try {
      if (scope === "all" || !orig) {
        await removeAvailabilityM.mutateAsync(c.id);
      } else if (scope === "this_and_following") {
        await upsertAvailabilityM.mutateAsync({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.date, -1) });
      } else {
        await upsertAvailabilityM.mutateAsync({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.date, -1) });
        await upsertAvailabilityM.mutateAsync({ ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: addDaysISO(c.date, 7), effectiveTo: orig.effectiveTo });
      }
    } catch (e) {
      if (orig) {
        const fallback =
          scope === "all" || !orig
            ? ({ action: "delete", targetAvailabilityId: c.id, summary: `${AVAILABILITY_KIND_LABEL[orig.kind]} 삭제` } as const)
            : ({
                action: "upsert",
                body: { id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.date, -1) },
                summary: `${AVAILABILITY_KIND_LABEL[orig.kind]} 기간 변경`,
              } as const);
        if (openAvailabilityApprovalFromError(e, fallback)) return;
      }
      alertAvailabilityError(apiErrorMessage(e, "삭제 실패")); reloadSelBlocks(); // [75A]
    }
  }
  // 블록 이동 반복 범위 적용(주간 반복 규칙을 기간으로 분할). origDate=이번 주 원위치, newDate=드롭 위치.
  async function applyBlockScope(scope: "this" | "this_and_following" | "all") {
    const c = blockScope; setBlockScope(null);
    if (!c) return;
    const orig = findBlock(c.id);
    if (!orig) return;
    const owner = { ownerType: orig.ownerType, ownerId: Number(orig.ownerId) } as const;
    const newPos = { ...owner, kind: c.kind, weekday: c.weekday, startTime: c.startTime, endTime: c.endTime };
    try {
      if (scope === "all" || !orig) {
        // 전체: 시간/요일만 바꾸고 기존 기간(effectiveFrom/To)은 보존.
        await upsertAvailabilityM.mutateAsync({ id: c.id, ...newPos, effectiveFrom: orig?.effectiveFrom, effectiveTo: orig?.effectiveTo });
      } else if (scope === "this_and_following") {
        // 원본을 이번 주 직전까지로 제한 + 새 규칙을 이번 주부터.
        await upsertAvailabilityM.mutateAsync({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.origDate, -1) });
        await upsertAvailabilityM.mutateAsync({ ...newPos, effectiveFrom: c.newDate, effectiveTo: orig.effectiveTo });
      } else {
        // 이번 주만: 원본 분할(이번 주 직전까지 + 다음 주부터 재개) + 이번 주 1회 새 위치.
        await upsertAvailabilityM.mutateAsync({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.origDate, -1) });
        await upsertAvailabilityM.mutateAsync({ ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: addDaysISO(c.origDate, 7), effectiveTo: orig.effectiveTo });
        await upsertAvailabilityM.mutateAsync({ ...newPos, effectiveFrom: c.newDate, effectiveTo: c.newDate });
      }
    } catch (e) {
      if (orig) {
        const fallback = {
          action: "upsert",
          body: { id: c.id, ...newPos, effectiveFrom: orig.effectiveFrom, effectiveTo: orig.effectiveTo },
          summary: `${AVAILABILITY_KIND_LABEL[c.kind]} 변경`,
        } as const;
        if (openAvailabilityApprovalFromError(e, fallback)) return;
      }
      alertAvailabilityError(apiErrorMessage(e, "적용 실패")); // [75A]
      reloadSelBlocks();
    }
  }

  // ── 불가/가용 밴드를 스케줄처럼 관리: 클릭=선택 · 끝 드래그=리사이즈 · 더블클릭=수정 · ✕=삭제 ──
  const [selBand, setSelBand] = useState<number | null>(null);
  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [bDraft, setBDraft] = useState<{ colKey: string; start: number; end: number; kind: string } | null>(null);
  const bDragRef = useRef<{
    colKey: string; date: string; origDate: string; kind: AvailabilityBlock["kind"]; id: number; edge: "top" | "bottom" | "move";
    startClientY: number; origStart: number; origEnd: number; start: number; end: number;
  } | null>(null);
  const bMovedRef = useRef(false); // 이동/리사이즈 드래그 발생 여부 — 직후 클릭(선택 토글) 억제용
  // 블록 이동 후 반복 범위 물어보기(이번 주만/이 주부터/모든 주). origDate=원래 이번 주 날짜, newDate=드롭 날짜.
  const [blockScope, setBlockScope] = useState<
    null | { id: number; kind: AvailabilityBlock["kind"]; origDate: string; newDate: string; weekday: number; startTime: string; endTime: string }
  >(null);
  // 반복 블록 삭제 시 범위 물어보기(이번만/앞으로/전체). date=삭제 클릭한 주의 날짜.
  const [blockDelScope, setBlockDelScope] = useState<null | { id: number; kind: AvailabilityBlock["kind"]; date: string }>(null);

  const bMove = (e: PointerEvent) => {
    const d = bDragRef.current; if (!d) return;
    const delta = snap(((e.clientY - d.startClientY) / HOUR_H) * 60);
    if (delta !== 0) bMovedRef.current = true;
    if (d.edge === "top") d.start = Math.min(d.origEnd - SNAP, clampMin(d.origStart + delta));
    else if (d.edge === "bottom") d.end = Math.max(d.origStart + SNAP, clampMin(d.origEnd + delta));
    else {
      // 본체 이동: 세로=시간, 가로=요일 컬럼(세션 이동과 동일한 컬럼 감지 재사용).
      const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-colcell]");
      if (cell?.dataset.colkey) {
        if (cell.dataset.colkey !== d.colKey) bMovedRef.current = true;
        d.colKey = cell.dataset.colkey;
        d.date = cell.dataset.date ?? d.date; // 다른 요일 컬럼이면 weekday가 바뀜(bUp에서 weekdayOf)
      }
      const dur = d.origEnd - d.origStart;
      let ns = clampMin(d.origStart + delta);
      if (ns + dur > END_H * 60) ns = END_H * 60 - dur;
      d.start = ns; d.end = ns + dur;
    }
    setBDraft({ colKey: d.colKey, start: d.start, end: d.end, kind: d.kind });
  };
  const bUp = () => {
    window.removeEventListener("pointermove", bMove);
    const d = bDragRef.current; bDragRef.current = null; setBDraft(null);
    if (!d || d.end <= d.start) return;
    // 시간·요일 모두 그대로면 변경 없음.
    if (d.start === d.origStart && d.end === d.origEnd && d.date === d.origDate) return;
    const orig = findBlock(d.id);
    const singleWeek = !!(orig?.effectiveFrom && orig.effectiveFrom === orig.effectiveTo); // 1회(단일 주) 블록
    // 단일 주 블록은 반복 범위를 물을 필요 없이 그 블록만 수정. 그 외(주간 반복)는 이동·리사이즈 모두 범위 물어봄.
    if (singleWeek && orig) {
      createBlock({
        id: d.id, ownerType: orig.ownerType, ownerId: Number(orig.ownerId), kind: d.kind,
        weekday: weekdayOf(d.date), startTime: fromMin(d.start), endTime: fromMin(d.end),
        effectiveFrom: orig?.effectiveFrom, effectiveTo: orig?.effectiveTo,
      });
      return;
    }
    setBlockScope({ id: d.id, kind: d.kind, origDate: d.origDate, newDate: d.date, weekday: weekdayOf(d.date), startTime: fromMin(d.start), endTime: fromMin(d.end) });
  };
  const bDown = (e: React.PointerEvent, c: { key: string; date: string }, b: { id: number; kind: string; startMin: number; endMin: number }, edge: "top" | "bottom" | "move") => {
    e.stopPropagation();
    bMovedRef.current = false;
    bDragRef.current = {
      colKey: c.key, date: c.date, origDate: c.date, kind: b.kind as AvailabilityBlock["kind"], id: b.id, edge,
      startClientY: e.clientY, origStart: b.startMin, origEnd: b.endMin, start: b.startMin, end: b.endMin,
    };
    setBDraft({ colKey: c.key, start: b.startMin, end: b.endMin, kind: b.kind });
    window.addEventListener("pointermove", bMove);
    window.addEventListener("pointerup", bUp, { once: true });
  };
  const bDownResize = (e: React.PointerEvent, c: { key: string; date: string }, b: { id: number; kind: string; startMin: number; endMin: number }, edge: "top" | "bottom") => bDown(e, c, b, edge);

  function describeConflicts(cs: Conflict[]): string {
    return formatScheduleConflicts(cs, { rows, resources, rooms });
  }
  // [B6 C1] 충돌 강행 확인 본문(구 window.confirm 문구 그대로 — 줄바꿈 보존)
  const conflictMessage = (cs: Conflict[], question: string): ReactNode => (
    <span className="whitespace-pre-wrap">{`충돌 ${cs.length}건:\n${describeConflicts(cs)}\n\n${question}`}</span>
  );

  // ── 낙관적 업데이트(렌더 레이턴시 해소) ──
  // 프론트에서 먼저 bounded Query cache를 반영하고, 백엔드 응답으로 확정하거나 실패 시
  // 해당 command가 만든 object/temp row만 롤백한다(동시 성공 command를 whole-array snapshot으로 지우지 않음).
  // ── PATCH 적용(낙관적 + 충돌 시 확인 후 force) ──
  async function applyPatch(id: number, patch: SchedulePatchBody) {
    if (!requireScheduleCacheReady()) return;
    // [TBO-29C C3] scope 편집은 series edit CAS 자동 회신 — 서버가 stale 명령을 409로 거른다.
    if (patch.scope && patch.scope !== "this" && patch.expectedSeriesVersion == null) {
      const seriesVersion = rows.find((r) => r.id === id)?.seriesVersion;
      if (seriesVersion != null) patch = { ...patch, expectedSeriesVersion: seriesVersion };
    }
    const beginOptimisticPatch = async (body: SchedulePatchBody) => {
      let beforeRow: ScheduleRow | undefined;
      let previewRow: ScheduleRow | undefined;
      const transaction = await beginRowsTransaction(
        (current) => current.map((row) => {
          if (row.id !== id) return row;
          beforeRow = row;
          previewRow = applyScheduleRowPatch(row, body);
          return previewRow;
        }),
        (current) => current.map((row) => row === previewRow && beforeRow ? beforeRow : row),
      );
      return { transaction, beforeRow };
    };
    const optimistic = await beginOptimisticPatch(patch);
    try {
      // [B6 C4] 훅 onSuccess가 캘린더 명령 무효화 → 스케줄 query cache reconcile(명시 load 불요)
      const res = await updateScheduleM.mutateAsync({
        id,
        body: patch,
        undoBefore: optimistic.beforeRow as unknown as Record<string, unknown> | undefined,
      });
      if (res.row) acceptAuthoritativeRows([id], [res.row]);
      optimistic.transaction.commit();
      if (res.updated > 1) setMsg(`반복 일정 ${res.updated}건 함께 수정되었습니다.`);
    } catch (e) {
      optimistic.transaction.rollback();
      const err = e as {
        response?: {
          status?: number;
          data?: Omit<Partial<SessionAccountingImpactConflict>, 'code'> & {
            code?: string;
            conflicts?: Conflict[];
          };
        };
      };
      if (err.response?.status === 409) {
        const code = err.response.data?.code;
        const impact = err.response.data?.impact;
        if (code === "SERIES_VERSION_STALE") {
          // [C3] 다른 변경이 시리즈를 먼저 갱신 — 자동 강행하지 않고 최신 상태로 재동기화 후 재시도 유도.
          setMsg("이 반복 수업이 방금 다른 변경으로 갱신됐습니다 — 최신 상태를 불러왔으니 다시 시도하세요.");
          await load();
          return;
        }
        if (impact && (code === "ACCOUNTING_IMPACT_ACK_REQUIRED" || code === "PAYOUT_REVERSAL_REQUIRED")) {
          setAccountingAck({ id, patch, impact, payoutLocked: code === "PAYOUT_REVERSAL_REQUIRED" });
          return;
        }
        const cs = err.response.data?.conflicts ?? [];
        setConfirmReq({
          title: "일정 충돌", confirmLabel: "그래도 적용",
          message: conflictMessage(cs, "그래도 적용할까요?"),
          onConfirm: async () => {
            const retry = await beginOptimisticPatch({ ...patch, force: true });
            // [M4] force 재시도도 실패할 수 있음(네트워크·400) — 미처리 거부/유령 낙관 상태 방지
            try {
              const result = await updateScheduleM.mutateAsync({
                id,
                body: { ...patch, force: true },
                undoBefore: retry.beforeRow as unknown as Record<string, unknown> | undefined,
              });
              if (result.row) acceptAuthoritativeRows([id], [result.row]);
              retry.transaction.commit();
            } catch {
              retry.transaction.rollback();
              setMsg("수정 실패");
              await load();
            }
          },
        });
      } else {
        // [개방 2026-07-06] 서버 사유 표면화 — 예: 학생 재배정 시 "코스 수강생이 아님"(400) 원인 안내
        const detail = apiErrorMessage(e, ""); // [75A]
        setMsg(`수정 실패${detail ? ` — ${detail}` : ""}`);
        if (!err.response?.status || err.response.status >= 500) await load();
      }
    }
  }

  function requestChange(r: ScheduleRow, patch: SchedulePatchBody, label: string) {
    // [TBO-16 #8] 수업 변경은 manager 이상(BE 403) — 강사는 요청·가용/불가만
    if (isInstructor) { setScheduleChangeApproval({ row: r, patch, label }); return; }
    // [M5] SessionEditFields가 이미 scope를 골라 보냈으면 RecurrencePrompt 재질문 생략(이중 질문 방지)
    if (r.seriesId != null && !("scope" in patch)) setPending({ row: r, patch, label });
    else applyPatch(r.id, patch);
  }

  async function submitScheduleChangeApproval(draft: ScheduleChangeApprovalDraft, requestReason: string, scope: RecurrenceScope) {
    const merged = applyScheduleRowPatch(draft.row, draft.patch);
    if (merged.instructorId == null) {
      setMsg("배정중 수업은 담당 강사를 먼저 지정해야 변경 요청을 보낼 수 있습니다.");
      return;
    }
    const body: CreateScheduleRequestBody = {
      requestKind: "session_update",
      targetSessionId: draft.row.id,
      courseId: merged.courseId,
      instructorId: merged.instructorId,
      roomId: merged.roomId,
      sessionDate: merged.sessionDate,
      startTime: merged.startTime,
      endTime: merged.endTime,
      durationMinutes: merged.durationMinutes,
      studentIds: merged.studentIds,
      topic: merged.topic,
      memo: merged.memo,
      kind: merged.kind,
      mode: merged.mode,
      requestReason,
      scope,
    };
    try {
      await createScheduleRequest.mutateAsync(body);
      setScheduleChangeApproval(null);
      setMsg("수업 변경 승인 요청을 보냈습니다 — 승인센터에서 처리됩니다.");
    } catch (e) {
      const detail = apiErrorMessage(e, ""); // [75A]
      setMsg(`요청 실패${detail ? ` — ${detail}` : ""}`);
    }
  }

  async function submitScheduleDeleteApproval(draft: ScheduleDeleteApprovalDraft, requestReason: string, scope: RecurrenceScope) {
    try {
      await createScheduleRequest.mutateAsync(buildSessionDeleteRequestBody(draft.row.id, requestReason, scope));
      setScheduleDeleteApproval(null);
      setEditing(null);
      setSelEvent(null);
      setMsg("수업 삭제 승인 요청을 보냈습니다 — 승인센터에서 처리됩니다.");
    } catch (e) {
      const detail = apiErrorMessage(e, ""); // [75A]
      setMsg(`삭제 요청 실패${detail ? ` — ${detail}` : ""}`);
    }
  }

  // 낙관적 생성용 임시 행(음수 id) — resources에서 라벨 파생. load()로 곧 서버 행으로 교체됨.
  function optimisticRow(body: ScheduleCreateBody): ScheduleRow {
    const c = resources?.courses.find((x) => x.id === body.courseId);
    const studentIds = (body.studentIds ?? []).map(Number);
    const start = body.startTime;
    // [R-9] 자정 크로스: endTime<start = 익일 종료(+1440), 파생 종료가 24:00 이상이면 endTime 미설정
    //  (BE 저장 규칙과 동일 — durationMinutes 파생. '25:00' 같은 무효 문자열 금지).
    const dur = body.endTime
      ? durationMinutesBetween(start, body.endTime) || 1
      : (body.durationMinutes ?? c?.durationMinutes ?? 60);
    const endMin = toMin(start) + dur;
    return {
      id: --optimisticRowIdRef.current, courseId: body.courseId,
      instructorId: body.instructorId ?? c?.instructorId ?? 0, roomId: body.roomId,
      sessionDate: body.sessionDate, weekday: weekdayOf(body.sessionDate),
      startTime: start, endTime: endMin >= 1440 ? undefined : fromMin(endMin), durationMinutes: Math.max(1, dur),
      status: (body.status as ScheduleRow["status"]) ?? "scheduled", color: body.color, memo: body.memo,
      courseName: c?.name ?? "수업", subjectName: c?.subjectName ?? "",
      instructorName: c?.instructorName ?? "", roomName: rooms.find((r) => r.id === body.roomId)?.name,
      studentIds,
      studentNames: studentIds.map((id) => resources?.students.find((student) => Number(student.id) === id)?.name ?? `#${id}`),
      attendanceRequired: false,
      missingAttendance: { instructor: false, studentIds: [] },
    } as ScheduleRow;
  }

  const beginOptimisticCreate = (previewRows: ScheduleRow[]) => {
    const temporaryIds = new Set(previewRows.map((row) => row.id));
    return beginRowsTransaction(
      (current) => [...current, ...previewRows],
      (current) => current.filter((row) => !temporaryIds.has(row.id)),
    );
  };

  // 세션 생성(추가, 낙관적). 강사는 본인(myInstructorId)으로 강제 — 권한 게이팅(데모; 실제는 백엔드 가드).
  // [TBO-16 #8·#9] 강사는 직접 배정 불가(BE 403) → **승인 요청(schedule-requests)으로 전환**.
  //  같은 입력·같은 검증(서버 validateSessionInput 재사용), 승인 시 매니저 경로로 세션 생성.
  async function createSession(body: ScheduleCreateBody) {
    if (instructorRequestMode) {
      try {
        await createScheduleRequest.mutateAsync(buildSessionCreateRequestBody(body, myInstructorId ?? undefined));
        setCreating(null);
        setMsg("승인 요청을 보냈습니다 — 매니저 승인 시 캘린더에 반영됩니다.");
      } catch (e) {
        setMsg(apiErrorMessage(e, "요청 실패 — 입력을 확인하세요")); // [75A]
      }
      return;
    }
    const safe: ScheduleCreateBody = body;
    if (!requireScheduleCacheReady()) return;
    const previewRows = [optimisticRow(safe)];
    const optimistic = await beginOptimisticCreate(previewRows);
    setCreating(null);
    try {
      const result = await createScheduleM.mutateAsync(safe); // [B6 C4] 무효화는 훅 lifecycle
      acceptAuthoritativeRows(previewRows.map((row) => row.id), [result.row]);
      optimistic.commit();
    } catch (e) {
      optimistic.rollback();
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        setConfirmReq({
          title: "일정 충돌", confirmLabel: "그래도 추가",
          message: conflictMessage(cs, "그래도 추가할까요?"),
          onConfirm: async () => {
            const retryRows = [optimisticRow(safe)];
            const retry = await beginOptimisticCreate(retryRows);
            // [M4] force 재시도 실패 시에도 롤백(미처리 거부 방지)
            try {
              const result = await createScheduleM.mutateAsync({ ...safe, force: true });
              acceptAuthoritativeRows(retryRows.map((row) => row.id), [result.row]);
              retry.commit();
            } catch {
              retry.rollback();
              setMsg("스케줄 추가 실패");
              await load();
            }
          },
        });
      } else {
        setMsg("스케줄 추가 실패");
        if (!err.response?.status || err.response.status >= 500) await load();
      }
    }
  }

  async function createHistoricalCompleted(body: import("@kms545487/contracts").CreateHistoricalCompletedSessionInput) {
    try {
      const result = await createHistoricalCompletedM.mutateAsync(body);
      setCreating(null);
      setMsg(`과거 완료 수업을 이관했습니다 — 강사·학생 출결 ${result.attendance.length + 1}건 저장 완료.`);
    } catch (error) {
      setMsg(apiErrorMessage(error, "과거 완료 수업을 이관하지 못했습니다."));
    }
  }

  // [TBO-29C C2] 반복 일정 생성 — 관리자: 서버 bulk command 1회(원자 커밋 — 부분 회차 잔존 불가).
  //  구 구현(단건 create loop + Promise.allSettled 보상 삭제 + 자동 force)은 브라우저 중단·삭제 실패 시
  //  반쪽 시리즈가 남았고 클라이언트 Date.now() seriesId는 규칙·생성자를 설명하지 못했다 — 전부 폐기.
  //  충돌은 자동 force하지 않고 전체 목록을 보여준 뒤 사용자가 감수 여부를 결정한다(단건과 동일 UX).
  async function createSeriesCommand(body: ScheduleSeriesCreateBody, previews: ScheduleCreateBody[]) {
    if (!requireScheduleCacheReady()) return;
    const previewRows = previews.map(optimisticRow);
    const optimistic = await beginOptimisticCreate(previewRows);
    setCreating(null);
    const send = async (force: boolean) => {
      // [B6 C4] 서버 확정본 재동기화는 훅 onSuccess(캘린더 명령 무효화)가 담당
      const res = await createScheduleSeriesM.mutateAsync(force ? { ...body, force: true } : body);
      setMsg(`반복 일정 ${res.rows.length}건을 추가했습니다${force ? " (충돌 감수)" : ""}.`);
      return res;
    };
    try {
      const result = await send(false);
      acceptAuthoritativeRows(previewRows.map((row) => row.id), result.rows);
      optimistic.commit();
    } catch (e) {
      optimistic.rollback();
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        setConfirmReq({
          title: "일정 충돌", confirmLabel: "그래도 추가",
          message: conflictMessage(cs, "그래도 추가할까요?"),
          onConfirm: async () => {
            const retryRows = previews.map(optimisticRow);
            const retry = await beginOptimisticCreate(retryRows);
            try {
              const result = await send(true);
              acceptAuthoritativeRows(retryRows.map((row) => row.id), result.rows);
              retry.commit();
            } catch {
              retry.rollback();
              setMsg("반복 일정 추가 실패");
              await load();
            }
          },
        });
      } else {
        setMsg("반복 일정 추가 실패");
        if (!err.response?.status || err.response.status >= 500) await load();
      }
    }
  }

  // [TBO-78 C2] 강사 반복 — 서버 bulk command 한 번으로 전체 요청+audit를 원자 저장한다.
  // idempotency key는 한 mutation 변수에 결속되어 network retry가 중복 요청을 만들지 않는다.
  async function createSeriesRequests(bodies: ScheduleCreateBody[]) {
    if (bodies.length === 0) return;
    if (bodies.length === 1) return createSession(bodies[0]);
    setCreating(null);
    try {
      const result = await createScheduleRequestBulk.mutateAsync(
        buildSessionCreateRequestBatch(
          bodies,
          myInstructorId ?? undefined,
          crypto.randomUUID(),
        ),
      );
      setMsg(`반복 수업 승인 요청 ${result.rows.length}건을 보냈습니다 — 매니저 승인 시 캘린더에 반영됩니다.`);
    } catch {
      setMsg("반복 승인 요청 전체를 저장하지 못했습니다 — 입력을 확인하고 다시 시도하세요.");
    }
  }

  // 세션 삭제(낙관적). 확인 후 즉시 제거 → 실패 시 롤백.
  async function deleteSession(id: number) {
    if (isInstructor) {
      const row = rows.find((r) => r.id === id);
      if (!row) { setMsg("삭제 요청 실패 — 수업을 찾을 수 없습니다."); return; }
      setScheduleDeleteApproval({ row });
      return;
    } // [TBO-16 #8] 강사는 직접 삭제 대신 승인 요청
    // [TBO-29C C3] 반복 회차 삭제는 scope 선택(this/이후/전체) — 서버가 payout lock 전 회차 사전검증 + CAS.
    const target = rows.find((r) => r.id === id);
    if (target?.seriesId != null) { setPendingDelete({ row: target }); return; }
    setConfirmReq({
      title: "스케줄 삭제", message: "이 스케줄을 삭제할까요? (삭제 내역은 DB에 보존됩니다)",
      confirmLabel: "삭제", danger: true,
      onConfirm: () => performDelete(id),
    });
  }

  async function performDelete(id: number, opts?: { scope?: "this" | "this_and_following" | "all"; expectedSeriesVersion?: number }) {
    if (!requireScheduleCacheReady()) return;
    const scope = opts?.scope ?? "this";
    let removedRow: ScheduleRow | undefined;
    let removedIndex = -1;
    const optimistic = await beginRowsTransaction(
      (current) => {
        removedIndex = current.findIndex((row) => row.id === id);
        removedRow = removedIndex >= 0 ? current[removedIndex] : undefined;
        return current.filter((row) => row.id !== id);
      },
      (current) => {
        if (!removedRow || current.some((row) => row.id === id)) return current;
        const restored = [...current];
        restored.splice(Math.min(Math.max(removedIndex, 0), restored.length), 0, removedRow);
        return restored;
      },
    );
    setEditing(null);
    setSelEvent(null);
    try {
      // [B6 C4] 중앙 훅 — scope=this(기본값)는 인자 자체를 생략해 종전과 동일한 요청 형태 유지
      const res = await removeScheduleM.mutateAsync({
        id,
        ...(scope !== "this" ? { scope } : {}),
        ...(opts?.expectedSeriesVersion != null ? { expectedSeriesVersion: opts.expectedSeriesVersion } : {}),
      });
      updateRows((current) => current.filter((row) => !res.removedIds.includes(row.id)));
      optimistic.commit();
      setMsg(res.removedIds && res.removedIds.length > 1 ? `반복 일정 ${res.removedIds.length}건을 삭제했습니다.` : "스케줄을 삭제했습니다.");
    } catch (e) {
      optimistic.rollback();
      const err = e as { response?: { status?: number; data?: { code?: string; message?: string } } };
      if (err.response?.data?.code === "SERIES_VERSION_STALE") {
        setMsg("이 반복 수업이 방금 다른 변경으로 갱신됐습니다 — 최신 상태를 불러왔으니 다시 시도하세요.");
        await load();
      } else if (err.response?.data?.code === "PAYOUT_REVERSAL_REQUIRED") {
        setMsg(err.response.data.message ?? "정산서에 연결된 회차가 있어 삭제할 수 없습니다 — 정산 회수 후 다시 시도하세요.");
      } else {
        setMsg("삭제 실패");
        if (!err.response?.status || err.response.status >= 500) await load();
      }
    }
  }

  // 붙여넣기 — 커서 시각을 시작으로 복제 생성(cloneSessionBody: 단건·scheduled·출결/시리즈 미승계).
  //  충돌·FK·권한(강사=본인 강제)은 기존 createSession 경로 재사용(409 confirm force).
  // 학생 컬럼에 붙여넣으면 원본 과목/코스는 유지하고 대상 학생만 명시 참가자로 저장한다.
  function pasteAt(src: ScheduleRow, target: PasteTarget) {
    if (isInstructor) { setMsg("수업 복제 배정은 매니저 권한입니다 — '+ 추가'로 요청하세요."); return; } // [TBO-16 #8]
    createSession(cloneSessionBody(src, target));
  }

  // 키보드: Ctrl/⌘+C=선택 수업 복사 · Ctrl/⌘+V=커서 위치 붙여넣기 · Esc=커서·선택 해제.
  //  입력 요소 포커스 중에는 무시(폼 타이핑 방해 금지).
  // 최신 핸들러 ref와 전역 listener lifecycle은 공통 browser-sync hook이 소유한다.
  useWindowKeydown((e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "c") {
      const r = rows.find((x) => x.id === selEvent);
      if (!r) return;
      setClip(r);
      setMsg(`복사됨 — ${r.courseName} (${r.durationMinutes}분) · 빈 시간을 클릭한 뒤 Ctrl+V`);
    } else if (mod && e.key.toLowerCase() === "v") {
      if (!canAdd) return;
      if (!clip) { setMsg("복사된 수업이 없습니다 — 수업을 클릭하고 Ctrl+C"); return; }
      if (!cursor) { setMsg("붙여넣을 빈 시간을 먼저 클릭하세요"); return; }
      e.preventDefault();
      // [이슈2] 시차 커서면 현지 좌표를 KST로 변환해 붙여넣기(무결성). KST면 그대로.
      const kst = tzCellToKst(cursor.date, cursor.startMin, cursor.tz);
      pasteAt(clip, { ...cursor, date: kst.date, startMin: kst.startMin });
    } else if (e.key === "Escape") {
      setCursor(null); setSelEvent(null); setSelBand(null);
    }
  });

  // 다운로드 파일명은 로그인 계정이 아니라 실제로 렌더 중인 강사/학생을 pane 순서대로 사용한다.
  function downloadName(ext: string) {
    // [C4.5] 인물 해석은 순수 함수(lib/domain/calendar-export.resolveExportPeople)로 분리 — 단위 테스트 대상.
    const nameOf = (dim: "instructor" | "student", id: number) =>
      (dim === "instructor" ? resources?.instructors : resources?.students)?.find((option) => Number(option.id) === Number(id))?.name;
    const basePanes = calendarPanesState.panes.flatMap((pane) => [
      { dim: "instructor" as const, ids: pane.filters.instructorIds },
      { dim: "student" as const, ids: pane.filters.studentIds },
    ]).filter((pane) => pane.ids.length > 0);
    const people = resolveExportPeople({
      manualPanes: [],
      autoTzPanes: [],
      basePanes,
      instructorIds: [],
      studentIds: [],
      selected,
      nameOf,
    });
    return calendarExportFilename({
      people,
      currentDate: todayISO(),
      view: "week",
      ext: ext === "jpg" ? "jpg" : "png",
    });
  }

  // 현재 뷰(캘린더/표)를 이미지로 저장.
  async function saveImage(type: "png" | "jpeg") {
    if (!captureRef.current) return;
    setBusyImg(true);
    try {
      await exportNodeAsImage(captureRef.current, downloadName(type === "jpeg" ? "jpg" : "png"), type);
    } catch {
      setMsg("이미지 내보내기 실패");
    } finally {
      setBusyImg(false);
    }
  }

  // ── 드래그 이동(포인터 기반 라이브 프리뷰, 30분 스냅 — 구글/애플 캘린더식) ──
  const SNAP_MOVE = 30;
  const snapMove = (m: number) => Math.round(m / SNAP_MOVE) * SNAP_MOVE;
  const onEmptyRangeMove = (event: PointerEvent) => {
    const drag = emptyRangeRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startClientY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    const currentMin = calendarMinuteAtPointer({
      clientY: event.clientY,
      rectTop: drag.rectTop,
      hourHeight: HOUR_H,
      gridMin: drag.gridMin,
      gridMax: drag.gridMax,
      snapMinutes: SNAP_MOVE,
    });
    drag.range = calendarRangeBetween({
      anchorMin: drag.anchorMin,
      currentMin,
      gridMin: drag.gridMin,
      gridMax: drag.gridMax,
      snapMinutes: SNAP_MOVE,
    });
    setEmptyRangeDraft({ colKey: drag.col.key, date: drag.col.date, ...drag.range });
  };
  const onEmptyRangeUp = (event: PointerEvent) => {
    window.removeEventListener("pointermove", onEmptyRangeMove);
    window.removeEventListener("pointerup", onEmptyRangeUp);
    window.removeEventListener("pointercancel", cancelEmptyRange);
    const drag = emptyRangeRef.current;
    emptyRangeRef.current = null;
    const selectedRange = drag?.range;
    setEmptyRangeDraft(null);
    if (!drag || event.pointerId !== drag.pointerId || !drag.moved || !selectedRange) return;
    suppressEmptyClickRef.current = true;
    setCreating({
      date: drag.col.date,
      start: fromMin(selectedRange.startMin),
      end: fromMin(selectedRange.endMin),
      owner: drag.col.resType && drag.col.resId != null
        ? ({ type: drag.col.resType, id: drag.col.resId, name: drag.col.label } as ScheduleResource)
        : undefined,
      defaultInstructorId: drag.col.resType === "instructor" ? drag.col.resId : undefined,
      tz: drag.tz ?? undefined,
    });
  };
  const cancelEmptyRange = () => {
    window.removeEventListener("pointermove", onEmptyRangeMove);
    window.removeEventListener("pointerup", onEmptyRangeUp);
    window.removeEventListener("pointercancel", cancelEmptyRange);
    emptyRangeRef.current = null;
    setEmptyRangeDraft(null);
  };
  const beginEmptyRange = (
    event: ReactPointerEvent<HTMLDivElement>,
    col: Col,
    gridMin: number,
    gridMax: number,
    tz?: CountryInfo | null,
  ) => {
    if (event.target !== event.currentTarget || !canAdd || event.button !== 0 || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorMin = calendarMinuteAtPointer({
      clientY: event.clientY,
      rectTop: rect.top,
      hourHeight: HOUR_H,
      gridMin,
      gridMax,
      snapMinutes: SNAP_MOVE,
    });
    const range = { startMin: anchorMin, endMin: anchorMin + SNAP_MOVE };
    emptyRangeRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      moved: false,
      rectTop: rect.top,
      anchorMin,
      gridMin,
      gridMax,
      range,
      col,
      tz,
    };
    setEmptyRangeDraft({ colKey: col.key, date: col.date, ...range });
    window.addEventListener("pointermove", onEmptyRangeMove, { passive: false });
    window.addEventListener("pointerup", onEmptyRangeUp, { once: true });
    window.addEventListener("pointercancel", cancelEmptyRange, { once: true });
  };
  const [moveDrag, setMoveDrag] = useState<{ id: number; colKey: string; start: number; dur: number; color: string; copy: boolean } | null>(null);
  const moveRef = useRef<{
    id: number; row: ScheduleRow; dur: number; grab: number; startClientY: number; moved: boolean;
    colKey: string; date: string; roomId?: number; start: number;
    resType?: SplitDim; resId?: number; // 스플릿 컬럼 드롭 — instructor면 강사 재배정(백엔드 FK·충돌 검증)
    copy: boolean; // Ctrl/⌘+드래그 = 이동 대신 복제(Lantiv 셀 복제)
    tz?: string; // [이슈2] 드롭 컬럼이 시차 뷰면 그 tz — 커밋 시 현지→KST 변환
  } | null>(null);
  const suppressClickRef = useRef(false);

  const onMovePointer = (e: PointerEvent) => {
    const d = moveRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startClientY) < 4) return;
    d.moved = true;
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-colcell]");
    if (!cell) return;
    // [이슈2] 시차 셀에도 드롭 허용 — 셀의 그리드 시작·끝(분)으로 좌표 계산, tz는 커밋 시 KST 변환.
    const gm = Number(cell.dataset.gridmin ?? GRID_MIN), gmax = Number(cell.dataset.gridmax ?? END_H * 60);
    const rect = cell.getBoundingClientRect();
    const start = Math.max(gm, Math.min(gmax - SNAP, snapMove(gm + ((e.clientY - rect.top) / HOUR_H) * 60 - d.grab)));
    d.colKey = cell.dataset.colkey ?? d.colKey;
    d.date = cell.dataset.date ?? d.date;
    d.roomId = cell.dataset.roomid ? Number(cell.dataset.roomid) : undefined;
    d.resType = (cell.dataset.restype || undefined) as SplitDim | undefined;
    d.resId = cell.dataset.resid ? Number(cell.dataset.resid) : undefined;
    d.tz = cell.dataset.tzid || undefined;
    d.start = start;
    setMoveDrag({ id: d.id, colKey: d.colKey, start, dur: d.dur, color: colorOf(d.row), copy: d.copy });
  };
  const onMoveUp = () => {
    window.removeEventListener("pointermove", onMovePointer);
    const d = moveRef.current;
    moveRef.current = null;
    setMoveDrag(null);
    if (!d || !d.moved) return;
    suppressClickRef.current = true;
    // [R-1b 2026-07-06] F2: 드래그가 셀을 한 번도 못 맞히면(colKey 빈 값 — 그리드 밖 플릭 릴리즈) 커밋 스킵.
    //  moveRef 초기 좌표는 표시 행(시차 컬럼=현지 벽시계)이라 그대로 커밋하면 로컬 좌표가 KST로 오염된다.
    if (!d.colKey) return;
    // [이슈2] 시차 컬럼 드롭이면 현지(날짜·분)를 KST로 변환. 비교·저장은 항상 KST 원본 기준(무결성).
    const kst = tzCellToKst(d.date, d.start, d.tz);
    const orig = rows.find((x) => x.id === d.id) ?? d.row; // KST 원본(seriesId·비교용)
    // Ctrl+드래그 = 복제(원본 유지, 드롭 지점에 새 세션) — cloneSessionBody 무결성 규칙 적용.
    if (d.copy) {
      pasteAt(orig, { date: kst.date, startMin: kst.startMin, resType: d.resType, resId: d.resId, roomId: d.roomId });
      return;
    }
    const newRoom = d.roomId ?? orig.roomId;
    // 스플릿(강사) 컬럼으로 드롭 → 강사 재배정(백엔드 FK·충돌 검증).
    const newInstructor = d.resType === "instructor" && d.resId != null ? d.resId : orig.instructorId;
    const instructorPatch = newInstructor != null && newInstructor !== orig.instructorId
      ? { instructorId: newInstructor }
      : {};
    // [개방 2026-07-06] 학생 컬럼 드롭 → 1:1 수업이면 그 학생으로 재배정(studentIds 교체 —
    //  BE가 "그 코스 활성 수강생의 부분집합" 검증, 아니면 400 롤백+메시지).
    //  단체(참가자 2명+)는 임의 재배정 방지 — 참가자 유지, 시간만 이동(안내 토스트).
    const curCohort = (orig.studentIds ?? []).map(Number);
    const dropStudent = d.resType === "student" && d.resId != null ? Number(d.resId) : null;
    const reassignStudent = dropStudent != null && !curCohort.includes(dropStudent) && curCohort.length === 1;
    if (dropStudent != null && !curCohort.includes(dropStudent) && curCohort.length > 1)
      setMsg("단체 수업은 학생 재배정 없이 시간만 이동합니다(참가자 유지)");
    // [#2] 과목 컬럼 드롭 — 과목은 코스 파생이라 변경 불가(무결성). 다른 과목 표에 놓으면 시간만 이동.
    if (d.resType === "subject" && d.resId != null && subjectIdOf(Number(orig.courseId)) !== Number(d.resId))
      setMsg("과목은 변경할 수 없어 시간만 이동합니다");
    if (kst.date === orig.sessionDate && kst.startMin === startMinOf(orig) && newRoom === orig.roomId && newInstructor === orig.instructorId && !reassignStudent)
      return;
    requestChange(
      orig,
      {
        sessionDate: kst.date, startTime: fromMin(kst.startMin), durationMinutes: d.dur, roomId: newRoom,
        ...instructorPatch,
        ...(reassignStudent ? { studentIds: [dropStudent] } : {}),
      },
      reassignStudent
        ? "학생 재배정 및 이동"
        : newInstructor !== orig.instructorId ? "강사 재배정 및 이동" : `${fromMin(kst.startMin)}로 이동`,
    );
  };
  const onEventDown = (e: React.PointerEvent, r: ScheduleRow, srcTz?: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grab = ((e.clientY - rect.top) / HOUR_H) * 60;
    moveRef.current = {
      id: r.id, row: r, dur: r.durationMinutes, grab, startClientY: e.clientY, moved: false,
      colKey: "", date: r.sessionDate, roomId: r.roomId, start: startMinOf(r),
      copy: e.ctrlKey || e.metaKey, // Ctrl/⌘ 누른 채 드래그 = 복제
      tz: srcTz, // [R-1b 2026-07-06] F2 이중 방어: 소스 컬럼 tz 시드 — 초기 좌표(현지 벽시계)의 해석 기준 명시
    };
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onMoveUp, { once: true });
  };

  // ── 리사이즈(시작/끝 핸들) ──
  const onResizeMove = (e: PointerEvent) => {
    const rz = resizingRef.current;
    if (!rz) return;
    const delta = snap(((e.clientY - rz.startClientY) / HOUR_H) * 60);
    const clampAxis = (mm: number) => clampToAxis(mm, rz.gm, rz.gmax); // [이슈2] 축 경계(KST 8~22 / tz 0~24)
    let start = rz.origStart,
      end = rz.origEnd;
    if (rz.edge === "bottom") end = Math.max(rz.origStart + SNAP, clampAxis(rz.origEnd + delta));
    else start = Math.min(rz.origEnd - SNAP, clampAxis(rz.origStart + delta));
    // [오류5] 델타 동봉 — 시차가 다른 컬럼은 (자기 좌표 + 델타)로 미리보기(프레임 불변)
    const pv = { id: rz.id, start, end, dStart: start - rz.origStart, dEnd: end - rz.origEnd };
    previewRef.current = pv;
    setPreview(pv);
  };
  const onResizeUp = () => {
    window.removeEventListener("pointermove", onResizeMove);
    const rz = resizingRef.current;
    const pv = previewRef.current;
    resizingRef.current = null;
    previewRef.current = null;
    setPreview(null);
    if (!rz || !pv || pv.id !== rz.id) return;
    if (pv.start === rz.origStart && pv.end === rz.origEnd) return;
    const r = rows.find((x) => x.id === rz.id);
    if (!r) return;
    // [이슈2] 시차 컬럼이면 현지 시각(pv.start/end, 현지 날짜 기준)을 KST로 변환해 저장(무결성).
    const kstStart = tzCellToKst(rz.dateLocal, pv.start, rz.tz);
    const kstEnd = tzCellToKst(rz.dateLocal, pv.end % 1440, rz.tz); // [R-9] 1440(24:00)은 '00:00'로 — BE가 익일 종료로 해석
    requestChange(
      r,
      { sessionDate: kstStart.date, startTime: fromMin(kstStart.startMin), endTime: fromMin(kstEnd.startMin) },
      `${fromMin(pv.start)}–${fromMin(pv.end)}로 시간 조정`,
    );
  };
  const onResizeDown = (e: React.PointerEvent, r: ScheduleRow, edge: "top" | "bottom", tz?: string | null, gm: number = GRID_MIN, gmax: number = END_H * 60) => {
    e.stopPropagation();
    resizingRef.current = { id: r.id, edge, startClientY: e.clientY, origStart: startMinOf(r), origEnd: endMinOf(r), gm, gmax, tz: tz ?? undefined, dateLocal: r.sessionDate };
    previewRef.current = { id: r.id, start: startMinOf(r), end: endMinOf(r), dStart: 0, dEnd: 0 };
    setPreview(previewRef.current);
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp, { once: true });
  };

  // 현재 시각 인디케이터(빨간 선)용 — 오늘 컬럼에 표시
  const _now = new Date();
  const nowMin = _now.getHours() * 60 + _now.getMinutes();
  const nowTop = ((nowMin - GRID_MIN) / 60) * HOUR_H;
  const showNow = mounted && nowMin >= GRID_MIN && nowMin <= END_H * 60; // [TBO-21 B2] mount 후에만(하이드레이션 불일치 방지)

  // ── 우측 패널 데이터: 위=필터 결과 리스트(날짜 오름차순) · 아래=클릭 세션 상세(ScheduleRow DTO) ──
  const listRows = activeCalendarRows;
  // 그룹 토글 차원: 학생 선택 시 학생별(스펙), 그 외 강의실 > 강사 순 폴백
  const listGroupDim: Exclude<ListGroupBy, "none"> = activeCalendarPane.filters.studentIds.length
    ? "student"
    : activeCalendarPane.filters.roomIds.length
      ? "room"
      : "instructor";
  const detailRow = detailId != null ? (rows.find((r) => r.id === detailId) ?? null) : null;
  // QA(2026-07-02): 리스트 클릭 시 상세 패널이 뷰포트 아래에 있어 안 보임 → 선택 시 자동 스크롤.
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const scrollDetailIntoView = () =>
    setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);

  // ── 타임그리드 렌더(공용) — 단일/스플릿 표가 같은 상호작용(드래그·커서·밴드·복제)을 공유 ──
  //  열폭: 컨테이너를 균등 분할(flex-1). estColW(실측 기반 추정)로 텍스트 모드 결정,
  //  minCol(스플릿 44px) 미만으로 좁아질 상황이면 가로 스크롤 발동(minWidth).
  // tzc: 이 그리드의 국가(시차 뷰). 비KST면 ① 행을 그 나라 로컬로 변환(표시 전용) ② 시간축 0~24h
  //  ③ 편집·드래그·복제·밴드 잠금(저장은 KST 단일 진실원 — 무결성). 표(스플릿)마다 다르게 지정 가능.
  // [스플릿 높이 정렬 2026-07-07] 한 표(그리드)의 시간축(startH~endH)을 산출(순수). 스플릿 표들이 서로
  //  높이가 어긋나지 않도록, 호출부에서 여러 표의 축을 unionAxis로 합쳐 axisOverride로 넘긴다.
  //  시차 표(tz)·개별 시차 컬럼은 0~24h로 확장(expandAxis) — 시차까지 고려한 공통 축이 됨.
  const computeAxis = (cols: Col[], sourceRows: ScheduleRow[], tzc?: CountryInfo | null): { startH: number; endH: number } => {
    // [KST 고정] kstFixed면 시차 반영 안 함(전 컬럼 KST 축) → 축이 08~22 + 콘텐츠 확장.
    const tzActive = !kstFixed && !!tzc && tzc.tz !== KST_TZ;
    const anyColTz = !kstFixed && !tzActive && cols.some((c) => c.tzc != null);
    const axisTz = tzActive || anyColTz;
    let contentLo = START_H * 60, contentHi = END_H * 60;
    if (!axisTz) {
      const colDates = new Set(cols.map((c) => c.date));
      for (const r of sourceRows) {
        if (colDates.has(r.sessionDate)) { contentLo = Math.min(contentLo, startMinOf(r)); contentHi = Math.max(contentHi, endMinOf(r)); }
        // [R-9] 전일 자정 크로스 세션의 익일 잔여(00:00~) — 다음날 컬럼이 보이면 축을 0시까지.
        if (endMinOf(r) > 1440 && colDates.has(addDaysISO(r.sessionDate, 1))) contentLo = 0;
      }
      const owners = cols.filter((c) => c.resType != null && c.resId != null);
      const blockSrc = owners.length
        ? allBlocks.filter((b) => owners.some((o) => b.ownerType === o.resType && Number(b.ownerId) === Number(o.resId)))
        : selBlocks;
      for (const b of blockSrc) { contentLo = Math.min(contentLo, toMin(b.startTime)); contentHi = Math.max(contentHi, toMin(b.endTime)); }
    }
    return expandAxis(axisTz, contentLo, contentHi, START_H, END_H); // 순수 함수(vitest) — 시차는 전일 축
  };
  // 여러 표의 축을 합쳐 가장 넓은 공통 축(모든 표 동일 높이 → 나란히 비교 가능).
  const unionAxis = (list: { startH: number; endH: number }[]): { startH: number; endH: number } =>
    list.length ? { startH: Math.min(...list.map((a) => a.startH)), endH: Math.max(...list.map((a) => a.endH)) } : { startH: START_H, endH: END_H };

  const renderTimeGrid = (
    cols: Col[],
    tzc: CountryInfo | null | undefined,
    paneFilters: CalendarFacetFilters | undefined,
    availW: number | undefined,
    axisOverride: { startH: number; endH: number } | undefined,
    sourceRows: ScheduleRow[],
  ) => {
    // [KST 고정] kstFixed면 tz 위치 변환·편집 변환 없음(전 컬럼 KST). 국가정보는 칩 현지시각 라벨용으로만 유지.
    const tzActive = !kstFixed && !!tzc && tzc.tz !== KST_TZ;
    // 학생 개별 시차(피드백 2026-07-03 #1): 그리드 tz(전역/표별 — 명시 선택)가 없을 때만
    //  학생 컬럼의 country 파생 tz가 동작. 축은 컬럼 하나라도 tz면 0~24h(다른 나라 새벽 대비).
    const anyColTz = !kstFixed && !tzActive && cols.some((c) => c.tzc != null);
    // [스플릿 높이 정렬] 축은 공통(axisOverride) 우선 — 없으면 이 표 자체 축. 시차·심야 콘텐츠 확장은 computeAxis가 처리.
    const { startH, endH } = axisOverride ?? computeAxis(cols, sourceRows, tzc);
    const gridMin = startH * 60, gridMax = endH * 60, gridH = (endH - startH) * HOUR_H;
    const clampAxis = (mm: number) => clampToAxis(mm, gridMin, gridMax); // [이슈2] 이 그리드 축 경계
    // 변환 캐시(같은 filtered·tz면 재사용) — 표 2개/컬럼별 tz/리렌더에서 tz별 1회만 O(n) 변환(감사 M4)
    const cache = tzRowsCacheRef.current;
    if (cache.src !== sourceRows) { cache.src = sourceRows; cache.map.clear(); }
    const rowsForTz = (tz: string): ScheduleRow[] => {
      if (tz === KST_TZ) return sourceRows;
      const hit = cache.map.get(tz);
      if (hit) return hit;
      const shifted = shiftRowsToTz(sourceRows, tz);
      cache.map.set(tz, shifted);
      return shifted;
    };
    const isSplitGrid = cols[0]?.resType != null;
    // 데일리 스플릿(피드백 최종): 요일 열을 컨테이너 폭에 맞춰 압축하고, 그 안을 인원수로
    //  서브분할(같은 크기 요일 열을 늘리는 게 아님 — 컴팩트). 일수가 적으면 flex로 화면을 채움.
    const dayCount = isSplitGrid ? new Set(cols.map((c) => c.date)).size : cols.length;
    const perDay = isSplitGrid ? Math.max(1, Math.round(cols.length / Math.max(1, dayCount))) : 1;
    // [C3] 일별 컬럼은 표 개수·날짜 수가 늘어도 한 화면 비교가 되도록 최소폭만 남기고 압축한다.
    const netW = Math.max(80, (availW ?? mainW) - GUTTER_W - 10);
    const fitDayW = Math.floor(netW / Math.max(1, dayCount));
    const minDayW = 24 * perDay;
    const dayW = Math.max(minDayW, fitDayW);
    const subW = isSplitGrid ? Math.max(24, Math.floor(dayW / perDay)) : Math.max(24, dayW);
    // 텍스트 밀도 단계(서브열 폭 기준) — 단일 함수 densityOf(lib/domain/lantiv, vitest)로 통일(R2)
    const textMode = densityOf(subW, isSplitGrid);
    const minCol = subW;
    const axisTzc = kstFixed ? axisCompanionTimezone(cols.map((c) => c.tzc), tzc) : undefined;
    const axisDate = cols[0]?.date ?? todayISO();
    const gutterTitle = kstFixed
      ? axisTzc
        ? `모든 표가 KST 기준 00~24시 축으로 정렬됩니다. 시간축 아래에는 ${axisTzc.name} 현지 시각을 병기합니다.`
        : "모든 표가 KST 기준 00~24시 축으로 정렬됩니다. 해외 현지 시각은 컬럼 헤더와 수업 칩에 병기됩니다."
      : tzActive && tzc
        ? `${tzc.name} 현지 시각 축입니다.`
        : anyColTz
          ? "컬럼마다 현지 시각 축입니다."
          : "한국 표준시 축입니다.";
    return (
              <div className="card overflow-x-auto overflow-y-hidden">
                <div className="flex" /* [고정폭] minWidth 강제 제거 — 스크롤 없음 */>
                  {/* 시간 거터 */}
                  <div className="shrink-0 sticky left-0 z-10 bg-canvas" style={{ width: GUTTER_W }}>
                    {/* [다중 시차 UX] 세로 눈금의 기준을 명시 — 개별 시차 혼재 시 "현지"(컬럼별), 표 전체 tz면 그 국기, 아니면 KST */}
                    <div style={{ height: HEADER_H }} className="flex items-end justify-end pr-1.5 pb-1">
                      <span className="text-[9px] text-fg-subtle mono" title={gutterTitle}>
                        {kstFixed ? "KST" : tzActive ? tzc!.flag : anyColTz ? "현지" : "KST"}
                      </span>
                    </div>
                    <div className="relative" style={{ height: gridH }}>
                      {Array.from({ length: endH - startH + 1 }, (_, i) => (
                        <span
                          key={i}
                          className="absolute right-2 text-micro text-fg-subtle mono"
                          style={{ top: i * HOUR_H - 7 }}
                        >
                          {i < endH - startH ? (
                            <span className="inline-flex flex-col items-end leading-none">
                              <span>KST {pad(startH + i)}:00</span>
                              {axisTzc && (
                                <span className="text-[8px] text-fg-subtle">
                                  ({axisTzc.name}: {fromMin(((startH + i) * 60 + tzOffsetFromKst(axisTzc.tz, axisDate) + 1440) % 1440)})
                                </span>
                              )}
                            </span>
                          ) : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* 컬럼들 */}
                  <div className="flex-1 flex">
                    {cols.map((c) => {
                      // 컬럼 유효 tz: 그리드(전역/표별) > 학생 개별(country) > KST
                      const colTzc = tzActive ? tzc : (c.tzc ?? null);
                      // [KST 고정] kstFixed면 위치·편집 변환 없음(colTz=false) → 전 컬럼 KST 좌표. 국가는 라벨용으로만.
                      const colTz = !kstFixed && !!colTzc && colTzc.tz !== KST_TZ;
                      // 표시용 국가(kstFixed 무관) — 그리드 tz 또는 컬럼 개별 country.
                      const colCountry = (tzc && tzc.tz !== KST_TZ ? tzc : null) ?? (c.tzc ?? null);
                      const colIsOverseas = !!colCountry && colCountry.tz !== KST_TZ;
                      // [다중 시차 UX] 세로 눈금 의미를 명확히 — KST 오프셋. off-모드 개별시차 컬럼 헤더 배지 + kstFixed 칩 현지시각.
                      const colOff = colIsOverseas ? tzOffsetFromKst(colCountry!.tz, c.date) : 0;
                      const colOffLabel = colIsOverseas ? `KST${colOff >= 0 ? "+" : "-"}${Math.floor(Math.abs(colOff) / 60)}${Math.abs(colOff) % 60 ? ":" + pad(Math.abs(colOff) % 60) : ""}h` : "";
                      // kstFixed일 때 칩에 병기할 현지시각 = KST분 + 오프셋(자정 넘김은 24h 모듈로).
                      const toLocal = (mm: number) => ((mm + colOff) % 1440 + 1440) % 1440;
                      // 전역 필터와 같은 판정 함수를 쓰되, 이 표의 필터를 추가로 적용한다.
                      const panePass = (r: ScheduleRow) => matchesCalendarFacetFilters(
                        r,
                        attBySession.get(Number(r.id)) ?? [],
                        paneFilters,
                      );
                      const colRows = rowsOfColumn(c, colTz ? rowsForTz(colTzc.tz) : sourceRows).filter(panePass);
                      // [R-9] 전일 자정 크로스 세션의 익일 연속 블록(00:00~잔여) — **표시 전용**(상호작용은
                      //  시작일 원본 블록에서). KST 컬럼 전용 — 시차 컬럼은 shiftRowToTz가 현지 좌표로
                      //  통변환하므로(대개 크로스가 풀림) 기존 tzOverflowEnd 배지 규칙을 유지.
                      const contRows = !colTz
                        ? rowsOfColumn({ ...c, date: addDaysISO(c.date, -1) }, sourceRows).filter(panePass).filter((r) => endMinOf(r) > 1440)
                        : [];
                      // [B-4 #9] 강사 본인 pending 요청 고스트(승인 대기 시각화) — KST 컬럼 전용·표시 전용.
                      //  세션 요청과 availability 요청을 분리해 타입별 geometry를 각각 계산한다.
                      const colGhosts = !colTz && isInstructor
                        ? pendingGhosts.filter((g) =>
                            (g.requestKind == null || g.requestKind === "session_create" || g.requestKind === "session_update") &&
                            g.sessionDate === c.date &&
                            (c.resType == null || (c.resType === "instructor" && Number(c.resId) === Number(g.instructorId))),
                          )
                        : [];
                      // [오류5] 미리보기 = 자기 프레임 좌표 + 프레임 불변 델타 — 시차 컬럼에서도 그 나라 시간으로 표시
                      const sOf = (r: ScheduleRow) => (preview && preview.id === r.id ? startMinOf(r) + preview.dStart : startMinOf(r));
                      const eOf = (r: ScheduleRow) => (preview && preview.id === r.id ? endMinOf(r) + preview.dEnd : endMinOf(r));
                      const lanes = layoutLanes(colRows.map((r) => ({ id: r.id, start: sOf(r), end: eOf(r) })));
                      const bands = bandsOfColumn(c, gridMin, gridMax, colTz ? colTzc.tz : null); // [이슈1] 시차 컬럼도 변환해 표시
                      const availabilityGhosts = !colTz && c.resType && c.resType !== "subject" && c.resId != null
                        ? availabilityGhostBandsForColumn({
                            requests: pendingGhosts,
                            blocks: allBlocks,
                            date: c.date,
                            owner: { type: c.resType, id: c.resId },
                          })
                        : [];
                      const isToday = c.date === todayISO();
                      return (
                        <div
                          key={c.key}
                          className="border-l overflow-hidden shrink-0" /* [고정폭] 컬럼 = 계산된 px 고정(유동 제거) + 클립 */
                          style={{
                            borderColor: c.resType && c.firstOfDate ? "var(--color-line)" : "var(--color-line-muted)",
                            borderLeftWidth: c.resType && c.firstOfDate ? 2 : undefined,
                            width: minCol,
                          }}
                        >
                          {/* 헤더: 스플릿=날짜+리소스명 · 주간=요일+날짜(오늘 강조) · 일간=강의실 */}
                          <div
                            className="flex flex-col items-center justify-center gap-0.5 border-b relative"
                            style={{ height: HEADER_H }}
                          >
                            {c.resType ? (
                              <>
                                {c.sub && (
                                  <span className={`text-[10px] ${isToday ? "text-accent font-semibold" : "text-fg-subtle"}`}>
                                    {c.sub}
                                  </span>
                                )}
                                {/* [다중 시차 UX] 해외 컬럼 오프셋 배지 — off-모드(개별 시차, 눈금=현지) 또는 kstFixed(눈금=KST, 칩=현지) */}
                                {colIsOverseas && (colTz || kstFixed) && minCol > 46 && (
                                  <span className="text-[9px] mono text-fg-subtle leading-none" title={kstFixed ? `${colCountry!.name} · 눈금은 KST, 칩에 현지시각 병기(${colOffLabel})` : `${colCountry!.name} 현지 시각으로 표시 · 세로 눈금은 이 컬럼 현지 기준(${colOffLabel})`}>
                                    {colCountry!.flag} {colOffLabel}
                                  </span>
                                )}
                                {/* 이름은 truncate, 국기 버튼은 truncate 밖(잘림·클릭 좌표 소실 방지) */}
                                <span className="flex items-center gap-0.5 max-w-full px-1 min-w-0">
                                  <span
                                    className="text-caption font-semibold truncate min-w-0"
                                    title={`${c.label}${!tzActive && c.tzc ? ` — ${c.tzc.name} 시간(개별 시차)` : ""}`}
                                  >
                                    {c.label}
                                  </span>
                                  {/* [오류3] 좁은 컬럼(≤46px)에선 + 숨김 — 이름·국기(시차 단서)가 먼저 잘리지 않게(추가는 드래그·우측 카드로 가능) */}
                                  {canAdd && c.resType != null && c.resId != null && minCol > 46 && (
                                    <button
                                      className="shrink-0 hover:opacity-70 text-micro leading-none px-0.5"
                                      title={`${c.label}에게 추가 — 수업·가용·불가(유저 프리필)`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCreating({
                                          date: c.date,
                                          owner: { type: c.resType!, id: c.resId!, name: c.label } as ScheduleResource,
                                          defaultInstructorId: c.resType === "instructor" ? c.resId : undefined,
                                          tz: colTz ? colTzc : undefined, // [이슈1] 비KST 컬럼: 현지→KST 변환
                                        });
                                      }}
                                    >
                                      ＋
                                    </button>
                                  )}
                                  {/* [2I] owner 컬럼 시차 수동 변경 — 학생/강사 공통. 국기(현재 tz)/🌐(KST) 클릭 = 픽커 */}
                                  {!tzActive && (c.resType === "student" || c.resType === "instructor") && c.resId != null && (
                                    <button
                                      className="shrink-0 hover:opacity-70 text-caption leading-none px-0.5 py-0.5 -my-0.5"
                                      title={`${c.label} 컬럼 시차 변경`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); // [오류4] fixed 좌표
                                        setTzPickerFor((prev) => (prev?.colKey === c.key ? null : { colKey: c.key, type: c.resType as Exclude<SplitDim, "subject">, id: c.resId!, x: b.left, y: b.bottom }));
                                      }}
                                    >
                                      {c.tzc ? c.tzc.flag : "🌐"}
                                    </button>
                                  )}
                                </span>
                                {/* [오류4] 시차 픽커 팝오버 — fixed(뷰포트 기준)로 컬럼 클리핑·옆 컬럼 가림 탈출(최상위 z) */}
                                {tzPickerFor?.colKey === c.key && (
                                  <span
                                    className="fixed z-[70] card shadow-[var(--shadow-overlay)] p-1.5 w-44 block"
                                    style={{ left: Math.max(8, Math.min(tzPickerFor.x, (typeof window !== "undefined" ? window.innerWidth : 1440) - 188)), top: tzPickerFor.y + 4 }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <select
                                      className="input h-7 w-full text-micro"
                                      autoFocus
                                      value={
                                        resourceTimezoneKey(tzPickerFor.type, tzPickerFor.id) in resourceTzOverride
                                          ? (resourceTzOverride[resourceTimezoneKey(tzPickerFor.type, tzPickerFor.id)]?.code ?? "KST")
                                          : "AUTO"
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setResourceTzOverride((prev) => {
                                          const key = resourceTimezoneKey(tzPickerFor.type, tzPickerFor.id);
                                          const n = { ...prev };
                                          if (v === "AUTO") delete n[key]; // 자동 = owner resource metadata
                                          else n[key] = v === "KST" ? null : (countryByCode(v) ?? null);
                                          return n;
                                        });
                                        setTzPickerFor(null);
                                      }}
                                    >
                                      <option value="AUTO">자동 — 유저 국가 기준</option>
                                      <option value="KST">🇰🇷 한국 시간(KST) 고정</option>
                                      {COUNTRIES.filter((x) => x.code !== "KR").map((x) => (
                                        <option key={x.code} value={x.code}>{x.flag} {x.name}</option>
                                      ))}
                                    </select>
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className={`text-micro ${isToday ? "text-accent font-semibold" : "text-fg-subtle"}`}>
                                  {c.label}
                                </span>
                                <span
                                  className={`grid place-items-center text-section font-semibold rounded-full ${isToday ? "text-white" : "text-fg"}`}
                                  style={{ width: 28, height: 28, background: isToday ? "var(--color-accent)" : "transparent" }}
                                >
                                  {Number(c.date.slice(8))}
                                </span>
                              </>
                            )}
                          </div>
                          <div
                            className="relative"
                            data-colcell
                            data-tz={colTz ? "1" : "0"}
                            data-tzid={colTz ? colTzc.tz : ""}
                            data-gridmin={gridMin}
                            data-gridmax={gridMax}
                            data-colkey={c.key}
                            data-date={c.date}
                            data-roomid={c.roomId ?? ""}
                            data-restype={c.resType ?? ""}
                            data-resid={c.resId ?? ""}
                            style={{
                              height: gridH,
                              backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0, var(--color-line) 1px, transparent 1px, transparent ${HOUR_H}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_H / 2}px, var(--color-line-muted) ${HOUR_H / 2}px, var(--color-line-muted) ${HOUR_H / 2 + 1}px, transparent ${HOUR_H / 2 + 1}px, transparent ${HOUR_H}px)`,
                            }}
                            onPointerDown={(event) => beginEmptyRange(event, c, gridMin, gridMax, colTz ? colTzc : null)}
                            onClick={(e) => {
                              if (suppressEmptyClickRef.current) { suppressEmptyClickRef.current = false; return; }
                              if (e.target !== e.currentTarget) return;
                              setSelEvent(null); setSelBand(null);
                              // [이슈2] 시차 컬럼도 커서 허용 — 현지 좌표(tz)를 저장, 붙여넣기 시 KST 변환.
                              const rect = e.currentTarget.getBoundingClientRect();
                              const min = clampAxis(snapMove(gridMin + ((e.clientY - rect.top) / HOUR_H) * 60));
                              setCursor({ colKey: c.key, date: c.date, startMin: min, resType: c.resType, resId: c.resId, roomId: c.roomId, tz: colTz ? colTzc.tz : undefined });
                            }}
                            onDoubleClick={(e) => {
                              // 빈 공간 더블클릭 = 그 시각으로 스케줄 추가(피드백 2026-07-02 #4).
                              // [이슈1] 비KST 컬럼도 추가 허용 — 입력은 현지 시각, 저장 시 KST 역변환(tz 전달).
                              if (e.target !== e.currentTarget || !canAdd) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const min = clampAxis(snapMove(gridMin + ((e.clientY - rect.top) / HOUR_H) * 60));
                              setCreating({
                                date: c.date, start: fromMin(min),
                                // 스플릿 컬럼이면 그 유저 프리필(유저별 추가 — 가용/불가 owner·강사 세션)
                                owner: c.resType && c.resId != null
                                  ? ({ type: c.resType, id: c.resId, name: c.label } as ScheduleResource)
                                  : undefined,
                                defaultInstructorId: c.resType === "instructor" ? c.resId : undefined,
                                tz: colTz ? colTzc : undefined, // 현지→KST 변환 기준
                              });
                            }}
                          >
                            {emptyRangeDraft?.colKey === c.key && (
                              <div
                                data-calendar-range-preview
                                className="absolute left-0.5 right-0.5 z-[1] pointer-events-none border border-accent"
                                style={{
                                  top: ((emptyRangeDraft.startMin - gridMin) / 60) * HOUR_H,
                                  height: Math.max(2, ((emptyRangeDraft.endMin - emptyRangeDraft.startMin) / 60) * HOUR_H),
                                  background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                                }}
                              >
                                <span className="block px-1 py-0.5 text-micro font-semibold text-accent truncate">
                                  {fromMin(emptyRangeDraft.startMin)}–{fromMin(emptyRangeDraft.endMin)}
                                </span>
                              </div>
                            )}
                            {/* 가용(초록)/불가(회색) 밴드 — 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제 (스케줄처럼 관리) */}
                            {bands.map((b) => {
                              const on = selBand === b.id;
                              return (
                              <div
                                key={`b${b.id}`}
                                onPointerDown={on ? (e) => { if (e.target === e.currentTarget) bDown(e, c, b, "move"); } : undefined}
                                onClick={(e) => {
                                  if (bMovedRef.current) { bMovedRef.current = false; return; } // 드래그 직후 클릭 무시(선택 유지)
                                  if (b.editable) { e.stopPropagation(); setSelBand(on ? null : b.id); setSelEvent(null); }
                                }}
                                onDoubleClick={(e) => { e.stopPropagation(); const blk = findBlock(b.id); if (blk) setEditingBlock(blk); }}
                                title={`${AVAILABILITY_KIND_LABEL[b.kind]} — 클릭 선택 · 드래그 이동 · 끝 드래그 시간조절 · 더블클릭 수정`}
                                className={`absolute left-0 right-0 ${!b.editable ? "pointer-events-none" : on ? "cursor-move" : "cursor-pointer"}`}
                                style={
                                  b.kind === "unavailable"
                                    ? {
                                        top: b.top, height: b.h,
                                        background:
                                          "repeating-linear-gradient(45deg, rgba(110,118,129,.16) 0 6px, rgba(110,118,129,.28) 6px 12px)",
                                        outline: on ? "2px solid var(--color-fg-muted)" : undefined,
                                      }
                                    : b.kind === "online_only"
                                      ? {
                                          top: b.top, height: b.h,
                                          background: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
                                          borderLeft: "2px solid var(--color-accent)",
                                          outline: on ? "2px solid var(--color-accent)" : undefined,
                                        }
                                      : {
                                        top: b.top, height: b.h,
                                        background: "rgba(26,127,55,.10)",
                                        borderLeft: "2px solid var(--color-success)",
                                        outline: on ? "2px solid var(--color-success)" : undefined,
                                      }
                                }
                              >
                                {on && (
                                  <>
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "top")} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b cursor-ns-resize bg-fg-muted" />
                                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id, c.date); }} className="absolute right-0.5 top-0.5 w-4 h-4 grid place-items-center rounded text-[10px] text-white bg-danger" title="삭제">✕</button>
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "bottom")} className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-2 rounded-t cursor-ns-resize bg-fg-muted" />
                                  </>
                                )}
                              </div>
                              );
                            })}
                            {/* [C2] availability 승인 대기 ghost — DB-backed schedule_requests에서 복원(새로고침 유지). */}
                            {availabilityGhosts.map((g) => {
                              const s = clampAxis(g.startMin);
                              const e = clampAxis(g.endMin);
                              if (e <= s) return null;
                              const isDelete = g.requestKind === "availability_delete";
                              const tone =
                                g.kind === "unavailable"
                                  ? "var(--color-fg-muted)"
                                  : g.kind === "online_only"
                                    ? "var(--color-accent)"
                                    : "var(--color-success)";
                              return (
                                <div
                                  key={`availability-ghost-${g.id}`}
                                  className="absolute left-0 right-0 z-10 pointer-events-none px-1 py-0.5 text-[10px] leading-tight overflow-hidden"
                                  style={{
                                    top: ((s - gridMin) / 60) * HOUR_H + 1,
                                    height: Math.max(18, ((e - s) / 60) * HOUR_H) - 2,
                                    color: isDelete ? "var(--color-danger)" : tone,
                                    border: `1.5px dashed ${isDelete ? "var(--color-danger)" : tone}`,
                                    background: isDelete
                                      ? "repeating-linear-gradient(45deg, rgba(207,34,46,.08) 0 6px, rgba(207,34,46,.18) 6px 12px)"
                                      : `color-mix(in srgb, ${tone} 12%, transparent)`,
                                  }}
                                  title={g.title}
                                >
                                  <div className="font-semibold truncate">⏳ {g.label}</div>
                                  <div className="mono">{fromMin(g.startMin)}–{fromMin(g.endMin)} 승인 대기</div>
                                </div>
                              );
                            })}
                            {/* 밴드 리사이즈 미리보기 */}
                            {bDraft && bDraft.colKey === c.key && (
                              <div className="absolute left-0 right-0 pointer-events-none" style={{
                                top: ((bDraft.start - gridMin) / 60) * HOUR_H,
                                height: Math.max(2, ((bDraft.end - bDraft.start) / 60) * HOUR_H),
                                background: "rgba(110,118,129,.30)", border: "1px dashed var(--color-fg-subtle)",
                              }} />
                            )}
                            {/* 커서 셀(빈 공간 클릭): 시각 배지 + (클립보드 있으면) 붙여넣기 미리보기 고스트 */}
                            {cursor && cursor.colKey === c.key && (
                              <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: ((cursor.startMin - gridMin) / 60) * HOUR_H }}>
                                <div className="h-0.5 bg-accent" />
                                <span className="absolute left-1 -top-2.5 px-1 rounded text-[10px] text-white mono bg-accent">
                                  {fromMin(cursor.startMin)}{clip ? " · Ctrl+V" : ""}
                                </span>
                                {clip && (
                                  <div
                                    className="absolute left-0.5 right-0.5 rounded-lg"
                                    style={{
                                      top: 2, height: Math.max(18, (clip.durationMinutes / 60) * HOUR_H) - 2,
                                      background: colorOf(clip), opacity: 0.25, border: "1.5px dashed var(--color-accent)",
                                    }}
                                  />
                                )}
                              </div>
                            )}
                            {/* 이벤트 이동 라이브 고스트(30분 스냅) */}
                            {moveDrag && moveDrag.colKey === c.key && (
                              <div className="absolute left-0.5 right-0.5 z-30 pointer-events-none rounded-lg text-white text-micro px-1.5 py-1 ring-2 ring-white" style={{
                                top: ((moveDrag.start - gridMin) / 60) * HOUR_H + 1,
                                height: Math.max(22, (moveDrag.dur / 60) * HOUR_H) - 2,
                                background: moveDrag.color, opacity: 0.9,
                              }}>
                                <div className="font-semibold mono">{fromMin(moveDrag.start)}–{fromMin((moveDrag.start + moveDrag.dur) % 1440)}{moveDrag.start + moveDrag.dur > 1440 ? " (+1일)" : ""}</div>
                              </div>
                            )}
                            {/* [B-4] 승인 대기 요청 고스트 — 점선·반투명·클릭 불가(승인 시 실제 세션으로 대체) */}
                            {colGhosts.map((g) => {
                              // [0.1.18] 요청 필드 optional화(availability 요청 수용) — 고스트는 sessionDate 매칭이라
                              //  session_create만 도달하지만 타입 방어(기본 00:00/60분).
                              const gs = toMin(g.startTime ?? "00:00");
                              // [R-9] 요청의 endTime<start = 익일 종료(자정 크로스) — 래핑해 높이 정상화
                              const ge = sessionEndMin({ startTime: g.startTime, endTime: g.endTime, durationMinutes: g.durationMinutes ?? 60 });
                              return (
                                <div key={`ghost-${g.id}`} className="absolute left-0.5 right-0.5 z-10 pointer-events-none rounded-lg px-1.5 py-1 text-[10px] leading-tight"
                                  style={{ top: ((clampAxis(gs) - gridMin) / 60) * HOUR_H + 1, height: Math.max(20, ((clampAxis(ge) - clampAxis(gs)) / 60) * HOUR_H) - 2,
                                    border: "1.5px dashed var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)" }}
                                  title={`승인 대기 요청 — ${g.topic ?? "수업"} ${g.startTime} (매니저 승인 시 확정)`}>
                                  <div className="font-semibold truncate">⏳ {g.topic ?? "수업"}</div>
                                  <div className="mono">{g.startTime}{g.endTime ? `–${g.endTime}` : ""} 승인 대기</div>
                                </div>
                              );
                            })}
                            {/* 현재 시각 인디케이터 */}
                            {!colTz && showNow && isToday && (
                              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                                <div className="h-px bg-danger" />
                                <div
                                  className="absolute rounded-full"
                                  style={{ width: 8, height: 8, left: -4, top: -4, background: "var(--color-danger)" }}
                                />
                              </div>
                            )}
                            {/* [R-9] 전일 자정 크로스 잔여(00:00~) 연속 블록 — 표시 전용(pointer-events 차단) */}
                            {contRows.map((r) => {
                              const spill = endMinOf(r) - 1440; // 익일 종료 분(00:00 기준)
                              const s0 = clampAxis(0), e0 = clampAxis(spill);
                              if (e0 <= s0) return null; // 축이 0시를 안 열었으면(이 컬럼에 스필 미표시) 생략
                              return (
                                <div
                                  key={`cont-${r.id}`}
                                  className="absolute left-0.5 right-0.5 pointer-events-none rounded-b-lg text-white text-micro leading-tight px-1.5 py-0.5 overflow-hidden"
                                  style={{
                                    top: ((s0 - gridMin) / 60) * HOUR_H + 1,
                                    height: Math.max(14, ((e0 - s0) / 60) * HOUR_H) - 2,
                                    background: colorOf(r), opacity: 0.5,
                                    borderTop: "2px dashed rgba(255,255,255,.9)",
                                  }}
                                  title={`${labelOf(r)} — 전일 ${r.startTime ?? ""} 시작 수업의 연속(~${fromMin(spill)}) · 편집·선택은 시작일 블록에서`}
                                >
                                  <div className="font-semibold truncate" style={{ fontSize: 9.5 }}>↰ {labelOf(r)} (전일 계속)</div>
                                  <div className="opacity-90 mono" style={{ fontSize: 9 }}>00:00–{fromMin(spill)}</div>
                                </div>
                              );
                            })}
                            {colRows.map((r) => {
                              const s = sOf(r),
                                en = eOf(r);
                              // [R-9] 자정 크로스는 시작일 컬럼에서 24:00(축 상한)으로 클램프해 그리고,
                              //  잔여는 "+1일 ~HH:mm" 배지(ovEnd) + 익일 컬럼 연속 블록(위 contRows)으로 표시.
                              const enC = Math.min(en, gridMax);
                              const ovEnd = (r as TzShiftedRow).tzOverflowEnd ?? crossMidnightEnd(r); // 시차 클램프(기존) ?? KST 크로스(R-9)
                              const top = ((s - gridMin) / 60) * HOUR_H;
                              const h = Math.max(22, ((enC - s) / 60) * HOUR_H);
                              const ln = lanes[r.id] ?? { lane: 0, lanes: 1 };
                              const wPct = 100 / ln.lanes;
                              return (
                                <div
                                  key={r.id}
                                  onPointerDown={(e) => onEventDown(e, r, colTz ? colTzc.tz : undefined)} // [R-1b 2026-07-06] F2 이중 방어
                                  onClick={(e) => { e.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } setSelEvent(r.id); setSelBand(null); setDetailId(r.id); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); openEditor(r, colTz ? colTzc : null); }}
                                  title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"}${ovEnd ? ` · 자정 넘김(+1일 ~${ovEnd})` : ""}${r.memo ? " · " + r.memo : ""} — 클릭=선택 · 드래그=이동 · 더블클릭=상세`}
                                  className={`absolute rounded-lg text-white text-micro leading-tight cursor-grab overflow-hidden shadow-sm hover:brightness-105 transition ${textMode === "vtitle" || textMode === "color" ? "px-0.5 py-0.5" : "px-1.5 py-1"} ${selEvent === r.id ? "ring-2 ring-white" : "ring-1 ring-black/5"}`}
                                  style={{
                                    top: top + 1,
                                    height: h - 2,
                                    left: `calc(${ln.lane * wPct}% + 2px)`,
                                    width: `calc(${wPct}% - 4px)`,
                                    // 색상만 단계에선 결강·보강 모두 회색(피드백) — makeup 포함
                                    background: textMode === "color" && r.status === "makeup" ? CANCELED_GRAY : colorOf(r),
                                    // 이동 중엔 원본을 흐리게, Ctrl+복제 중엔 원본 유지(복제임을 시각화)
                                    opacity: moveDrag?.id === r.id && !moveDrag.copy ? 0.35 : 1,
                                    outline: selEvent === r.id ? "2px solid var(--color-accent)" : undefined,
                                    outlineOffset: selEvent === r.id ? "1px" : undefined,
                                  }}
                                >
                                  {/* [개방 2026-07-06] 시차 컬럼에서도 리사이즈 — 커밋은 tzCellToKst로 KST 변환(R-1b·R-9 검증 경로) */}
                                  {selEvent === r.id && (
                                    <div onPointerDown={(e) => onResizeDown(e, r, "top", colTz ? colTzc.tz : null, gridMin, gridMax)} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b bg-white/90 cursor-ns-resize" />
                                  )}
                                  {/* 텍스트 3단계: full/title=가로 · vtitle=세로 글씨 · color=색상만 */}
                                  {(textMode === "full" || textMode === "title") && (
                                    <>
                                      <div
                                        className={`font-semibold truncate ${isSessionCanceled(r) ? "line-through opacity-90" : ""}`}
                                        style={textMode === "title" ? { fontSize: 10 } : undefined}
                                      >
                                        {labelOf(r)}{isSessionCanceled(r) ? ` (${isCanceledStatus(r.status) ? STATUS_LABEL[r.status] : "강사 결강"})` : ""}
                                      </div>
                                      <div className="opacity-90 mono truncate" style={textMode === "title" ? { fontSize: 9.5 } : undefined}>
                                        {fromMin(s)}–{fromMin(Math.min(en, 1440))}
                                        {ovEnd && (
                                          /* 자정 크로스 잔여(TBO-12 P0·R-9): 이 수업은 다음날 이 시각까지 이어짐 */
                                          <span className="ml-1 px-1 rounded bg-white/25 text-[9px] font-semibold not-italic">
                                            +1일 ~{ovEnd}
                                          </span>
                                        )}
                                        {/* [KST 고정] 해외 컬럼 칩에 현지시각 병기 — 눈금은 KST, 실제 순간은 세로 정렬 */}
                                        {kstFixed && colIsOverseas && (
                                          <span className="ml-1 px-1 rounded bg-black/20 text-[9px] font-semibold not-italic" title={`${colCountry!.name} ${fromMin(toLocal(s))}–${fromMin(toLocal(Math.min(en, 1440)))}`}>
                                            {colCountry!.name}: {fromMin(toLocal(s))}
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  )}
                                  {textMode === "full" && (
                                    <div className="opacity-80 truncate">
                                      {r.memo ? r.memo : (r.roomName ?? "")}
                                    </div>
                                  )}
                                  {textMode === "vtitle" && (
                                    // [세로 글씨 최적화 2026-07-07] px-0.5 py-0.5로 padding 축소 → 높이 여유 확보(maxHeight h-4).
                                    //  촘촘한 자간·lineHeight 1로 더 많은 글자 표시, 단일 열(nowrap)로 좌측 wrap 클립 방지.
                                    //  전체 이름은 title 툴팁으로 항상 보존(넘치면 세로 방향으로만 자연 클립).
                                    <div
                                      className="font-semibold overflow-hidden text-center"
                                      style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 9, lineHeight: 1, letterSpacing: "-0.3px", whiteSpace: "nowrap", maxHeight: Math.max(10, h - 4), overflow: "hidden" }}
                                      title={`${labelOf(r)} ${fromMin(s)}–${fromMin(Math.min(en, 1440))}${ovEnd ? ` (+1일 ~${ovEnd})` : ""}`}
                                    >
                                      {labelOf(r)}
                                    </div>
                                  )}
                                  {selEvent === r.id && (
                                    <div onPointerDown={(e) => onResizeDown(e, r, "bottom", colTz ? colTzc.tz : null, gridMin, gridMax)} className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-2 rounded-t bg-white/90 cursor-ns-resize" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
    );
  };

  const calendarPaneModels = calendarPanesState.panes.map((pane) => ({
    pane,
    columns: columnsForCalendarPane(pane),
    rows: calendarRowsByPane.get(pane.id) ?? [],
  }));
  const calendarPanesAxis = unionAxis(calendarPaneModels.map((model) => computeAxis(model.columns, model.rows)));

  return (
    <div className="mx-auto max-w-page-wide p-3 sm:p-6">
      {/* [DESIGN §5.5] 조작 설명서는 부제에서 제거 → ⓘ 팝오버. 부제는 상태 정보만. */}
      <PageHeader
        title="스케줄 캘린더"
        sub={
          /* [TBO-104 1D] 활성 pane이 바뀔 때 부제 길이가 달라져도 헤더 높이가 변하지 않도록 한 줄 고정.
             높이가 변하면 pointerdown~pointerup 사이에 pane 헤더 버튼이 이동해 첫 클릭이 소실됐다. */
          <span
            className="block max-w-full truncate"
            title={`${calendarPanePeriodLabel(activeCalendarPane)} · ${activeCalendarRows.length}건 · 시수 ${teachingHours(activeCalendarRows).hours}h · 표 ${calendarPanesState.panes.length}개`}
          >
            {calendarPanePeriodLabel(activeCalendarPane)}
            <span className="text-fg-subtle">
              {" "}· {activeCalendarRows.length}건 · 시수 {teachingHours(activeCalendarRows).hours}h · 표 {calendarPanesState.panes.length}개
            </span>
          </span>
        }
        actions={
          <>
            {canAdd && resources && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setCreating({ date: activeCalendarDates.find((date) => date === todayISO()) ?? activeCalendarDates[0] })}
              >
                + 스케줄 추가{isInstructor ? " (내 수업)" : ""}
              </button>
            )}
            <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("png")} title="현재 화면을 PNG로 저장(시차 뷰면 그 국가 시간 기준)">
              PNG
            </button>
            <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("jpeg")} title="현재 화면을 JPEG로 저장">
              JPEG
            </button>
            <HelpPopover title="캘린더 조작법">
              <p>드래그 = 이동 · Ctrl+드래그 = 복제</p>
              <p>Ctrl+C/V = 복사·붙여넣기 · 빈 시간 클릭 = 커서</p>
              <p>표 나누기 = 현재 표의 대상·기간·필터 복제</p>
              <p>기간 입력 드래그 = 범위 · Ctrl/Cmd+클릭 = 개별 날짜</p>
              <p>시차 컬럼도 편집 가능 — 저장은 KST 자동 변환</p>
              <p>가용 밴드: 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제</p>
              <p>같은 필터 안은 OR, 다른 필터 사이는 AND</p>
            </HelpPopover>
          </>
        }
      />

      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        {/* 좌측 추천 패널 제거(피드백 2026-07-02 #5) — 스플릿뷰로 강사·학생 스케줄을 직접 비교·배치. */}
        {/* 본문 */}
        <div ref={mainRef} className="flex-1 min-w-0 space-y-4">
          {hasAvailabilityLegend && (
            <p className="text-caption text-fg-subtle inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(26,127,55,.18)", borderLeft: "2px solid var(--color-success)" }} /> 가용
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, rgba(110,118,129,.18) 0 3px, rgba(110,118,129,.3) 3px 6px)" }} /> 불가
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(9,105,218,.16)", borderLeft: "2px solid var(--color-accent)" }} /> 온라인만 가능
              </span>
              {/* 조작법(클릭·드래그·삭제)은 헤더 ⓘ 팝오버로 이동(DESIGN §5.5) */}
            </p>
          )}

          {/* [TBO-29D ⑤] 학원 공통 일정 스트립 — 현재 보이는 날짜와 겹치는 이벤트(전 직원 공통·조회 전용).
              CUD는 관리자 화면(매니저 이상 — 요구 ⑥). 강사 개인 필터와 무관하게 항상 노출된다. */}
          {(() => {
            const visibleFrom = activeCalendarDates[0];
            const visibleTo = activeCalendarDates[activeCalendarDates.length - 1];
            const visible = academyEvents.filter((ev) => ev.startDate <= visibleTo && ev.endDate >= visibleFrom);
            // [B5 2026-07-16 대표 결정 ③] 일반수업+진단고사+모의고사(행사)+상담을 한 캘린더에서 —
            //  모의고사(type=exam) 등 학원 일정을 캘린더에서 바로 추가(매니저 이상, EventForm 재사용).
            if (!visible.length && !canManage) return null;
            const typeIcon: Record<string, string> = { notice: "📢", exam: "📝", holiday: "🏖", closure: "🚪", event: "🎓" };
            return (
              <div className="flex items-center gap-2 flex-wrap text-caption" data-academy-events>
                <span className="font-semibold text-fg-muted shrink-0">📌 학원 일정</span>
                {canManage && (
                  <button type="button" className="btn btn-xs" onClick={() => setShowEventForm((v) => !v)}
                    title="모의고사·휴원 등 학원 일정을 캘린더에서 바로 발행 (매니저 이상)">
                    {showEventForm ? "닫기" : "+ 학원 일정"}
                  </button>
                )}
                {visible.map((ev) => (
                  <span
                    key={ev.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-canvas-subtle"
                    title={`${ev.title} · ${ev.startDate}${ev.endDate !== ev.startDate ? `~${ev.endDate}` : ""}${ev.memo ? ` · ${ev.memo}` : ""}`}
                  >
                    <span>{typeIcon[ev.type] ?? "📌"}</span>
                    <span className={ev.priority === "high" ? "font-semibold" : ""}>{ev.title}</span>
                    <span className="text-fg-subtle mono">
                      {ev.startDate.slice(5).replace("-", "/")}
                      {ev.endDate !== ev.startDate ? `~${ev.endDate.slice(5).replace("-", "/")}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            );
          })()}
          {/* [B5] 학원 일정 인라인 발행 — admin EventsView의 EventForm 단일 컴포넌트 재사용 */}
          {showEventForm && canManage && (
            <div className="card border rounded-lg" data-event-inline-form>
              <EventForm compact onDone={() => setShowEventForm(false)} />
            </div>
          )}

          {msg && (
            <div
              className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-md px-4 py-2 text-body text-white shadow-lg md:bottom-6"
              style={{ background: /(실패|없습니다|수 없|연결할 수|올바)/.test(msg) ? "var(--color-danger)" : "var(--color-success)" }}
              role="status"
            >
              <span>{msg}</span>
              <button onClick={() => setMsg("")} className="opacity-80 hover:opacity-100" aria-label="닫기">✕</button>
            </div>
          )}

          <div ref={captureRef} className="bg-canvas">
            {calendarPaneModels.length ? (
              <div className="flex items-start gap-3 overflow-hidden">
                {calendarPaneModels.map((model, index) => {
                  const paneWidth = Math.max(
                    280,
                    (mainW - 12 * Math.max(0, calendarPaneModels.length - 1)) / calendarPaneModels.length,
                  );
                  return (
                    <div key={model.pane.id} className="min-w-0" style={{ width: paneWidth }}>
                      <CalendarPane
                        pane={model.pane}
                        active={calendarPanesState.activePaneId === model.pane.id}
                        resources={resources}
                        rooms={rooms}
                        subjects={subjectOpts}
                        dispatch={dispatchCalendarPanes}
                        paneIndex={index}
                        paneCount={calendarPaneModels.length}
                        allowedDimensions={isInstructor ? INSTRUCTOR_SPLIT_DIMS : undefined}
                      >
                        {renderTimeGrid(model.columns, null, undefined, paneWidth, calendarPanesAxis, model.rows)}
                      </CalendarPane>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* 우측 컬럼(Lantiv): 유저별 스케줄(단일 선택) + 수업 리스트(날짜순·그룹 토글) + 선택 수업 상세(DTO) */}
        <div className="w-full shrink-0 space-y-3 self-start lg:sticky lg:top-4 lg:w-64">
          {/* 우측 리스트: row 버튼 = 필터 토글, ⓘ 버튼 = 상세 카드만. 두 동작을 분리해 "상세 카드 열기(뷰는 그대로)" 계약을 지킨다. */}
          {resources && (
            <ResourcePanel
              resources={resources}
              selected={infoTarget}
              onSelect={setInfoTarget}
              filterIds={{
                instructor: new Set(activeCalendarPane.filters.instructorIds),
                student: new Set(activeCalendarPane.filters.studentIds),
                room: new Set(activeCalendarPane.filters.roomIds),
              }}
              onToggleFilter={(dim, id) => {
                if (isInstructor && (dim === "instructor" || dim === "student")) return;
                const filter = dim === "instructor" ? "instructorIds" : dim === "student" ? "studentIds" : "roomIds";
                const values = activeCalendarPane.filters[filter];
                dispatchCalendarPanes({
                  type: "pane/set-resource-filter",
                  paneId: activeCalendarPane.id,
                  filter,
                  values: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
                });
              }}
              allowedTypes={isInstructor ? INSTRUCTOR_RESOURCE_PANEL_TYPES : undefined}
            />
          )}
          {/* [피드백 2026-07-03] 스케줄 선택 → 포함 인원 리스트 → 한 명 클릭 → 바로 아래 유저 상세 카드 */}
          {detailRow && (
            <ParticipantsCard row={detailRow} picked={cardTarget} onPick={(r) => setInfoTarget(r)} />
          )}
          {/* 유저 상세·편집(피드백 2026-07-03 #2·#3): 선택 유저의 정보 확인 + 학생은 국가·상태 즉시 수정 */}
          {cardTarget && (
            <ResourceDetailCard
              selected={cardTarget}
              isFiltered={cardTarget.type === "instructor"
                ? activeCalendarPane.filters.instructorIds.includes(Number(cardTarget.id))
                : cardTarget.type === "student"
                  ? activeCalendarPane.filters.studentIds.includes(Number(cardTarget.id))
                  : activeCalendarPane.filters.roomIds.includes(Number(cardTarget.id))}
              onFocusView={() => {
                const filter = cardTarget.type === "instructor" ? "instructorIds" : cardTarget.type === "student" ? "studentIds" : "roomIds";
                dispatchCalendarPanes({ type: "pane/set-resource-filter", paneId: activeCalendarPane.id, filter, values: [Number(cardTarget.id)] });
              }}
              onClearFocus={() => {
                const filter = cardTarget.type === "instructor" ? "instructorIds" : cardTarget.type === "student" ? "studentIds" : "roomIds";
                dispatchCalendarPanes({ type: "pane/set-resource-filter", paneId: activeCalendarPane.id, filter, values: [] });
                setInfoTarget(cardTarget);
              }}
              onMsg={setMsg}
              onSaved={load}
              onAddSchedule={
                canAdd
                  ? () =>
                      setCreating({
                        // 기준일: 전역 추가 버튼과 동일 규칙(오늘이 뷰에 있으면 오늘, 아니면 첫 날)
                        date: activeCalendarDates.find((date) => date === todayISO()) ?? activeCalendarDates[0],
                        owner: cardTarget,
                        defaultInstructorId: cardTarget?.type === "instructor" ? Number(cardTarget.id) : undefined,
                      })
                  : undefined
              }
            />
          )}
          <SessionListPanel
            emptyHint={
              listRows.length ? undefined
                : `${calendarPanePeriodLabel(activeCalendarPane)} 기준 — 기간을 넓히거나 필터를 확인하세요`
            }
            rows={listRows}
            groupBy={listGrouped ? listGroupDim : "none"}
            groupDim={listGroupDim}
            onToggleGroup={() => setListGrouped((v) => !v)}
            selectedId={detailId}
            onPick={(r) => {
              setDetailId(r.id);
              setSelEvent(r.id);
              // 리스트 항목이 현재 뷰 기간 밖이면 그 날짜로 이동(그리드에서 바로 보이게)
              if (!activeCalendarDates.includes(r.sessionDate)) {
                dispatchCalendarPanes({
                  type: "pane/set-range",
                  paneId: activeCalendarPane.id,
                  anchorDate: r.sessionDate,
                  currentDate: r.sessionDate,
                });
              }
              scrollDetailIntoView();
            }}
            colorOf={colorOf}
          />
          <div ref={detailPanelRef}>
          <SessionDetailPanel
            onPickStudent={(id, name) => {
              // [A안 조정] 뷰는 그대로 — 우측에 정보 카드만(수정은 카드에서)
              const res = resources?.students.find((x) => Number(x.id) === id);
              setInfoTarget(res ?? ({ type: "student", id, name } as ScheduleResource));
            }}
            onPickInstructor={(id, name) => {
              const res = resources?.instructors.find((x) => Number(x.id) === id);
              setInfoTarget(res ?? ({ type: "instructor", id, name } as ScheduleResource));
            }}
            row={detailRow}
            rooms={rooms}
            instructors={(resources?.instructors ?? []).map((i) => ({ id: Number(i.id), name: i.name }))}
            canEdit={!!canAdd}
            colorOf={colorOf}
            onPatch={(r, patch, label) => requestChange(r, patch, label)}
            onDelete={(r) => deleteSession(r.id)}
            onOpenModal={(r) => openEditor(r)}
          />
          </div>
        </div>
      </div>

      <UndoHotkey />{/* [TBO-63] 스케줄 변동 undo — 스택 100·cmd/ctrl+Z */}

      {editing && (
        <SessionDetailModal
          row={editing}
          rooms={rooms}
          instructors={(resources?.instructors ?? []).map((i) => ({ id: Number(i.id), name: i.name }))}
          colorOf={colorOf}
          canEdit={canManage} // [TBO-62 ②] 강사 열람 전용 — 편집·삭제 UI 미노출(서버 ADMIN 403은 기구현)
          ownerTz={editingTz}
          onClose={() => { setEditing(null); setEditingTz(null); }}
          onDelete={() => deleteSession(editing.id)}
          onSave={async (patch) => {
            // [이슈1] 비KST 편집: 폼에 입력한 현지 시각(sessionDate/start/end)을 KST 저장값으로 역변환.
            //  [R-9] 종료가 KST에서 다음날로 넘어가면(end<start) 백엔드가 **익일 종료**로 해석해
            //  durationMinutes로 저장한다(자정 크로스 정식 지원 — 구 400 거부 폐지).
            const kst = editingTz ? kstPatchTimes(patch, editingTz.tz) : patch;
            const row = editing;
            setEditing(null); setEditingTz(null);
            // [29C 스팟체크 2026-07-15] applyPatch 직행이던 유일한 경로 — 강사가 상세 모달에서 저장하면
            //  403 토스트("접근 권한이 없습니다")로 끝났다. 우측 패널·드래그와 동일하게 requestChange를
            //  경유해 강사=승인 요청 모달, 관리자=기존 applyPatch(+반복 scope 재질문 규칙)로 통일한다.
            requestChange(row, kst, "상세 편집");
          }}
        />
      )}

      {pending && (
        <RecurrencePrompt
          label={pending.label}
          onCancel={() => {
            setPending(null);
            load();
          }}
          onPick={(scope) => {
            const p = pending;
            setPending(null);
            applyPatch(p.row.id, { ...p.patch, scope });
          }}
        />
      )}

      {pendingDelete && (
        <RecurrencePrompt
          label="반복 일정 삭제"
          onCancel={() => setPendingDelete(null)}
          onPick={(scope) => {
            const p = pendingDelete;
            setPendingDelete(null);
            performDelete(p.row.id, { scope, expectedSeriesVersion: scope !== "this" ? p.row.seriesVersion : undefined });
          }}
        />
      )}

      {accountingAck && (
        <AccountingImpactModal
          prompt={{ payoutLocked: accountingAck.payoutLocked, impact: accountingAck.impact }}
          onClose={() => setAccountingAck(null)}
          onConfirm={() => {
            const pendingImpact = accountingAck;
            setAccountingAck(null);
            if (pendingImpact.payoutLocked) {
              setMsg("정산 회수 또는 보정 거래 후 변경해 주세요.");
              return;
            }
            applyPatch(pendingImpact.id, { ...pendingImpact.patch, acknowledgeAccountingImpact: true });
          }}
        />
      )}

      <AccountingImpactModal
        prompt={removeScheduleM.accountingPrompt}
        onClose={removeScheduleM.dismissAccountingPrompt}
        onConfirm={() => removeScheduleM.confirmAccountingImpact({
          onSuccess: (res) => {
            updateRows((current) => current.filter((row) => !res.removedIds.includes(row.id)));
            setMsg(res.removedIds.length > 1 ? `반복 일정 ${res.removedIds.length}건을 삭제했습니다.` : "스케줄을 삭제했습니다.");
          },
          onError: () => setMsg("삭제 실패"),
        })}
      />

      {creating && resources && (
        <ScheduleCreateModal
          resources={resources}
          rooms={rooms}
          requestMode={instructorRequestMode} // 관리 capability가 있으면 복합 역할도 직접 명령 경로
          defaultDate={creating.date}
          defaultStart={creating.start}
          defaultEnd={creating.end}
          lockInstructorId={instructorRequestMode ? myInstructorId : undefined}
          defaultInstructorId={creating.defaultInstructorId}
          defaultOwner={creating.owner ?? selected}
          ownerTz={creating.tz ?? undefined}
          onClose={() => setCreating(null)}
          onCreate={createSession}
          onCreateHistorical={createHistoricalCompleted}
          onCreateSeries={createSeriesRequests}
          onCreateSeriesCommand={createSeriesCommand}
          onCreateBlock={createBlock}
        />
      )}

      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSave={async (body) => { setEditingBlock(null); await createBlock(body); }}
          onDelete={async () => { const id = editingBlock.id; setEditingBlock(null); await deleteBlock(id); }}
        />
      )}

      {blockScope && (
        <RecurrencePrompt
          label={`${AVAILABILITY_KIND_LABEL[blockScope.kind]} 변경`}
          onPick={applyBlockScope}
          onCancel={() => { setBlockScope(null); reloadSelBlocks(); }}
        />
      )}

      {blockDelScope && (
        <RecurrencePrompt
          label={`${AVAILABILITY_KIND_LABEL[blockDelScope.kind]} 삭제`}
          onPick={applyBlockDeleteScope}
          onCancel={() => setBlockDelScope(null)}
        />
      )}

      {availabilityApproval && (
        <AvailabilityApprovalModal
          draft={availabilityApproval}
          rows={rows}
          onClose={() => setAvailabilityApproval(null)}
          onSubmit={(requestReason) => submitAvailabilityApproval(availabilityApproval, requestReason)}
        />
      )}
      {scheduleChangeApproval && (
        <ScheduleChangeApprovalModal
          draft={scheduleChangeApproval}
          onClose={() => setScheduleChangeApproval(null)}
          onSubmit={(requestReason, scope) => submitScheduleChangeApproval(scheduleChangeApproval, requestReason, scope)}
        />
      )}
      {scheduleDeleteApproval && (
        <ScheduleDeleteApprovalModal
          draft={scheduleDeleteApproval}
          onClose={() => setScheduleDeleteApproval(null)}
          onSubmit={(requestReason, scope) => submitScheduleDeleteApproval(scheduleDeleteApproval, requestReason, scope)}
        />
      )}
      {/* [B6 C1] window.confirm 대체 — 항상 마지막 렌더(중첩 시 최상단, ModalShell 스택이 키 입력 게이트) */}
      {confirmReq && (
        <ConfirmModal
          title={confirmReq.title}
          message={confirmReq.message}
          confirmLabel={confirmReq.confirmLabel}
          danger={confirmReq.danger}
          onClose={() => setConfirmReq(null)}
          onConfirm={() => { const req = confirmReq; setConfirmReq(null); void req.onConfirm(); }}
        />
      )}
    </div>
  );
}

// [B6 C1] DetailModal·RecurrencePrompt·승인 요청 모달 3종·BlockEditModal은 modals/로 분리(ModalShell 이관).
// Field·ColorPicker는 SessionEditFields.tsx에서 import(폼 프리미티브 단일 소스).
