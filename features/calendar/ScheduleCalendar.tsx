"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScheduleRow, Room, Conflict, ScheduleResources, ScheduleResource, AvailabilityBlock, AccountRole, Attendance } from "@/types";
import { api, type SchedulePatchBody, type ScheduleCreateBody, type AvailabilityUpsertBody, type CreateScheduleRequestBody } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
// 시간·요일 유틸은 lib/domain/schedule 단일 소스(감사 D — 파일별 중복 toMin/fromMin/pad/WD 제거)
import { weekDates, weekdayOf, layoutLanes, teachingHours, toMin, fromMin, pad2 as pad, WEEKDAYS_KO as WD, ownerWindows, sessionEndMin, crossMidnightEnd } from "@/lib/domain/schedule";
import {
  PALETTE, STATUS_LABEL, MAX_SPLIT,
  matchesStatusFilter, matchesResourceFilter, isGroupSession, sortByDateAsc,
  buildMixedSplitColumns, rowInResource, cloneSessionBody, resolvePasteCourseId,
  type StatusFilter, type SplitDim, type ListGroupBy, type PasteTarget, type MixedPick, densityOf, expandAxis,
  MODE_FILTERS, MODE_FILTER_LABEL, type SessionModeFilter,
  matchesSubjectFilter, SUBJECT_KIND_OPTIONS } from "@/lib/domain/lantiv";
import { useAttendance, useStudents, useEnrollments, useCourses, useSubjects, useCreateViewPreset, useScheduleRequests, useCalendarSchedule, useRooms, useScheduleResources, useAllAvailability } from "@/lib/queries";
// 국가·시차(피드백 2026-07-02): KST 단일 진실원 → 표시 전용 변환(lib/domain/tz), 비KST 뷰는 편집 잠금
import { COUNTRIES, KST_TZ, countryByCode, shiftRowsToTz, tzOffsetFromKst, tzLocalToKst, kstBlockToTzWindow, kstPatchTimes, type CountryInfo, type TzShiftedRow, splitKstBand } from "@/lib/domain/tz";
import { CountryInput } from "./CountryInput";
import { CalendarViewTabs } from "./CalendarViewTabs";
import { serializeViewPreset, presetToState } from "@/lib/domain/presets";
import type { CalendarViewPreset } from "@/types";
import { exportNodeAsImage } from "@/lib/export";
import { useTacoStore } from "@/lib/store";
import { usePersistedState } from "@/lib/usePersistedState";
import { isAdmin, roleLabel } from "@/lib/roles";
import { currentClaims, myInstructorId as loginInstructorId } from "@/lib/auth";
import { ResourcePanel } from "./ResourcePanel";
import { ResourceDetailCard } from "./ResourceDetailCard";
import { ParticipantsCard } from "./ParticipantsCard";
import { SessionEditFields, ColorPicker, Field, TimeSelect } from "./SessionEditFields";
import { CalendarSplitPane, type SplitPaneDef } from "./CalendarSplitPane";
import { CalendarFilterBar, OptionPick, type Period } from "./CalendarFilterBar";
import { HelpPopover, PageHeader } from "@/components/ui";
import { SessionListPanel } from "./SessionListPanel";
import { SessionDetailPanel } from "./SessionDetailPanel";

// ── 그리드 상수 (애플/구글 캘린더 스타일: 넓고 시간 단위가 또렷하게) ──
const START_H = 0,
  END_H = 24,
  HOUR_H = 46, // 시간당 높이(px) — 세로로 너무 길지 않게 압축(한눈에 들어오도록)
  SNAP = 15;
const HEADER_H = 52; // 요일/강의실 헤더 높이
const GUTTER_W = 64; // 시간 거터 너비
const COL_MIN = 128; // 컬럼 최소 너비
const GRID_MIN = START_H * 60;
const GRID_H = (END_H - START_H) * HOUR_H;
// WD/toMin/fromMin/pad는 lib/domain/schedule, PALETTE/STATUS_LABEL은 lib/domain/lantiv에서 import(단일 소스).
// 시수 미측정·충돌 제외·회색 표시 대상(결강/취소)
const CANCELED_GRAY = "#8c959f";
const isCanceledStatus = (s?: string) => s === "canceled" || s === "no_show";
// [TBO-19] 강사 결석(instructorAttendance='absent')도 '결강'처럼 시각화(회색·취소선) — status는 바꾸지 않고 표시만.
//  (결석 시수 제외는 백엔드 payouts.measure가 담당. 여기선 캘린더 렌더만.)
const isSessionCanceled = (r: { status?: string; instructorAttendance?: string | null }) =>
  isCanceledStatus(r.status) || r.instructorAttendance === "absent";

const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;

// [R-1b 2026-07-06] F3: kstPatchTimes는 lib/domain/tz로 이동(순수 함수·vitest 회귀) —
//  자정 크로스 클램프 endTime('24:00')·무효값('24:05')이 저장 패치로 새지 않도록 방어 추가.

// [이슈2] 시차 그리드 셀 좌표(현지 날짜 + 현지 분) → KST {date, startMin}. 드래그·리사이즈·붙여넣기가
//  시차 뷰에서도 올바른 KST로 저장되도록 변환. tz 없으면(KST 컬럼) 그대로.
function tzCellToKst(dateLocal: string, localMin: number, tz?: string | null): { date: string; startMin: number } {
  if (!tz || tz === KST_TZ) return { date: dateLocal, startMin: localMin };
  const k = tzLocalToKst(dateLocal, fromMin(localMin), tz);
  return { date: k.date, startMin: toMin(k.time) };
}
// 축 경계로 분 클램프(단일 소스 — KST 8~22 / 시차 0~24 등 축마다 min·max만 다름). [최적화: 중복 클램프 통일]
const clampToAxis = (mm: number, min: number, max: number) => Math.max(min, Math.min(max, mm));
const clampMin = (mm: number) => clampToAxis(mm, GRID_MIN, END_H * 60); // KST 기본 축
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// 해당 날짜가 속한 주의 월요일
const mondayOf = (iso: string) => addDaysISO(iso, weekdayOf(iso) === 0 ? -6 : 1 - weekdayOf(iso));
const hashColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const startMinOf = (r: ScheduleRow) => toMin(r.startTime ?? "09:00");
// [R-9] 자정 크로스(endTime 미저장·durationMinutes 파생) 대응 — 1440 초과 가능(단일 소스: sessionEndMin)
const endMinOf = (r: ScheduleRow) => sessionEndMin({ startTime: r.startTime ?? "09:00", endTime: r.endTime, durationMinutes: r.durationMinutes });

type View = "month" | "week" | "day";
type ColorBy = "subject" | "instructor" | "room" | "student";
type ManualPaneState = { uid: number; dim: SplitDim; ids: number[] };
type Resizing = { id: number; edge: "top" | "bottom"; startClientY: number; origStart: number; origEnd: number;
  gm: number; gmax: number; tz?: string; dateLocal: string }; // [이슈2] 시차 뷰 리사이즈: 축 경계·tz·현지날짜
type Pending = { row: ScheduleRow; patch: SchedulePatchBody; label: string };
type AvailabilityImpact = { sessionId: number; sessionDate: string; startTime?: string; endTime?: string; reason?: string };
type AvailabilityApprovalDraft =
  | { action: "upsert"; body: AvailabilityUpsertBody; impacted: AvailabilityImpact[]; summary: string }
  | { action: "delete"; targetAvailabilityId: number; impacted: AvailabilityImpact[]; summary: string };
type AvailabilityApprovalSeed =
  | { action: "upsert"; body: AvailabilityUpsertBody; summary: string }
  | { action: "delete"; targetAvailabilityId: number; summary: string };

const AVAILABILITY_KIND_LABEL: Record<AvailabilityBlock["kind"] | "online_only", string> = {
  available: "가용시간",
  unavailable: "불가시간",
  online_only: "온라인만 가능",
};

export function ScheduleCalendar() {
  // [C-2 2026-07-06] 뷰 프리셋(월/주/일·색 기준·열 좁게)만 localStorage 복원 — 새로고침에도 유지.
  //  anchor(기준일)는 항상 오늘로 시작(과거 날짜 고정 방지). 내용 필터(Set)는 후속(setCodec)으로 확장.
  const [view, setView] = usePersistedState<View>("taco.cal.view", "week");
  const [anchor, setAnchor] = useState(todayISO());
  // [TBO-21 B2] 현재시각선은 new Date()를 렌더 중 계산 → SSR HTML과 클라 하이드레이션 시각이 달라
  //  React #418(hydration text mismatch)이 났다. mount 후에만 렌더해 서버·클라 첫 렌더를 일치시킴.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const { data: rooms = [] } = useRooms(); // [TBO-14 C2] 강의실 카탈로그 = Query(로컬 state·1회 fetch 대체)
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  // [이슈1] 편집 대상이 비KST 컬럼(현지 시각 표시)이면 그 tz — 저장 시 현지→KST 역변환 기준. KST면 null.
  const [editingTz, setEditingTz] = useState<CountryInfo | null>(null);
  const openEditor = useCallback((r: ScheduleRow, tz: CountryInfo | null = null) => { setEditing(r); setEditingTz(tz); }, []);
  const [selEvent, setSelEvent] = useState<number | null>(null); // 단일 클릭 선택(애플식 — 리사이즈 핸들 노출)
  const [pending, setPending] = useState<Pending | null>(null);
  // [오류5 2026-07-06] 리사이즈 미리보기 — start/end는 드래그 중인 컬럼의 "현지 분"(커밋용),
  //  dStart/dEnd는 프레임 불변 델타(±분). 다른 시차 컬럼(같은 세션)은 자기 좌표 + 델타로 그려
  //  시차 표에서도 미리보기가 그 나라 시간 기준으로 정확히 보인다(종전: 현지 분을 그대로 적용해 KST 표기 오염).
  const [preview, setPreview] = useState<{ id: number; start: number; end: number; dStart: number; dEnd: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [availabilityApproval, setAvailabilityApproval] = useState<AvailabilityApprovalDraft | null>(null);
  // 토스트 자동 사라짐(성공·정보 알림이 화면에 계속 남지 않도록)
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

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

  // 관리자(데모 역할) — 스케줄 직접 추가
  const qc = useQueryClient(); // [TBO-16] 요청 생성 후 scheduleRequests 무효화(배지·승인센터 동일 모집단)
  // [B-4] 내 수업 요청(강사) — 배지·승인센터와 같은 useScheduleRequests 단일 queryKey 구독
  const { data: myRequests = [] } = useScheduleRequests();
  const pendingGhosts = useMemo(() => myRequests.filter((r) => r.status === "pending"), [myRequests]);
  const role = useTacoStore((s) => s.currentRole);
  const canManage = isAdmin(role); // 대표/매니저/관리자 — 모든 스케줄 추가
  const isInstructor = role === "instructor"; // 강사 — 본인 스케줄만 추가
  const myInstructorId = isInstructor ? loginInstructorId() ?? undefined : undefined;
  const canAdd = canManage || (isInstructor && myInstructorId != null);
  // start가 있으면 그 시각으로 프리필(빈 곳 더블클릭 — 피드백 2026-07-02 #4).
  // [유저별 추가 2026-07-03] 전역 "+ 스케줄 추가"(현행)와 별개로, 스플릿 컬럼(유저)에서 그 유저
  //  프리필로 추가 — owner(가용/불가 소유자)·defaultInstructorId(세션 강사) 프리필.
  const [creating, setCreating] = useState<{
    date: string; start?: string;
    owner?: ScheduleResource | null; defaultInstructorId?: number;
    tz?: CountryInfo | null; // [이슈1] 비KST 컬럼에서 추가 시 — 입력은 현지 시각, 저장 시 KST 역변환
  } | null>(null);

  // ── 필터(Lantiv형) ──
  const [q, setQ] = useState("");
  const [colorBy, setColorBy] = usePersistedState<ColorBy>("taco.cal.colorBy", "subject");
  const [fInstructors, setFInstructors] = useState<Set<number>>(new Set());
  const [fSubjects, setFSubjects] = useState<Set<string>>(new Set());
  const [fRooms, setFRooms] = useState<Set<number>>(new Set());
  const [fStudents, setFStudents] = useState<Set<number>>(new Set());
  // Lantiv 확장: 상태(출석/지각/결강/보강) · 그룹 수업만 · 기간(from/to, 뷰 기간 대신 조회)
  const [fStatuses, setFStatuses] = useState<Set<StatusFilter>>(new Set());
  // [오류2 2026-07-06] 수업방식 필터(대면/비대면, class_sessions.mode v0.1.16) — 구 '종류' 카테고리 대체.
  //  진단고사/상담은 과목 필터의 유사 옵션(SUBJECT_KIND_OPTIONS)으로 이동. 프리셋 편입은 R-7.
  const [fModes, setFModes] = useState<Set<SessionModeFilter>>(new Set());
  const [groupOnly, setGroupOnly] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);
  // [이슈3] 표(패널)별 날짜 범위 — 캘린더(from/to)로 표마다 다르게(예: 왼쪽 7/6~7/8, 오른쪽 7/6~7/10).
  //  미설정=전역 기간을 따름. from만 있고 to 없으면 from 하루.
  // [fit-to-width 2026-07-06] 그리드 폭 = 컨테이너 폭(가로 스크롤 제거 — 대표 지적 2·3, Lantiv 대응).
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainW, setMainW] = useState(1100);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => { const w = es[0]?.contentRect.width; if (w) setMainW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // [전역 cherry-pick 2026-07-06] 원하는 날짜만 골라 보기(불연속, 최대 14) — 설정 시 기간(period)보다 우선.
  //  그리드 축(dates)·조회(range=min~max)·리스트/시수(filtered 날짜 술어)가 같은 집합을 쓴다(모집단 단일).
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  // [B-5 2026-07-06] 컴팩트 열 토글(대표 지적 1·3) — 하루 열 128px 고정이 두 표 스플릿에서 과폭.
  const [compactCols, setCompactCols] = usePersistedState<boolean>("taco.cal.compactCols", false);
  const colMinBase = compactCols ? 80 : COL_MIN; // densityOf(subW)가 자동 연동(좁아지면 title→vtitle→color)
  const [paneRange, setPaneRange] = useState<Partial<Record<SplitDim, { from: string; to: string }>>>({});
  // [B-3 #5] 표별 cherry-pick 날짜(불연속 집합, 최대 14) — 설정 시 paneRange(연속 범위)보다 우선.
  const [panePicked, setPanePicked] = useState<Partial<Record<SplitDim, string[]>>>({});
  // [오류2 2026-07-06] 표별 수업방식(대면/비대면) 필터 — 전역 fModes와 별개로 그 표에만 적용(빈 Set=전체).
  const [paneModes, setPaneModes] = useState<Partial<Record<SplitDim, Set<SessionModeFilter>>>>({});
  // [#2 2026-07-06] 수동 표 빌더 — 강사·학생·강의실·과목 임의 조합(학생×학생 등 동일차원 2표 허용).
  //  자동 스플릿(강사+학생 필터)과 병행: manualPanes가 있으면 그것을 우선 렌더, 없으면 기존 자동 동작.
  //  per-pane 필터(국가·수업방식)는 dim이 아닌 **uid 키**(동일차원 중복 시 충돌 방지 — §14 P1 대칭).
  const [manualPanes, setManualPanes] = useState<ManualPaneState[]>([]);
  const paneUidRef = useRef(1);
  const [paneCountryU, setPaneCountryU] = useState<Record<number, CountryInfo | null>>({});
  const [paneModesU, setPaneModesU] = useState<Record<number, Set<SessionModeFilter>>>({});
  const addManualPane = () => {
    setManualPanes((prev) => {
      const last = prev.at(-1);
      const seed: Omit<ManualPaneState, "uid"> = last
        ? { dim: last.dim, ids: [...last.ids] }
        : fInstructors.size
          ? { dim: "instructor", ids: [...fInstructors] }
          : fStudents.size
            ? { dim: "student", ids: [...fStudents] }
            : fRooms.size
              ? { dim: "room", ids: [...fRooms] }
              : { dim: "instructor", ids: [] };
      const uid = paneUidRef.current++;
      if (last) {
        const c = paneCountryU[last.uid] ?? null;
        const modes = paneModesU[last.uid];
        setPaneCountryU((cur) => ({ ...cur, [uid]: c }));
        if (modes) setPaneModesU((cur) => ({ ...cur, [uid]: new Set(modes) }));
      } else if (country) {
        setPaneCountryU((cur) => ({ ...cur, [uid]: country }));
      }
      return [...prev, { uid, ...seed }];
    });
  };
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
  // 학생 국가·수강·코스(붙여넣기 코스 재배정 + 국가 필터) — TanStack Query 캐시 공유.
  const { data: allStudents = [] } = useStudents();
  const { data: allEnrollments = [] } = useEnrollments();
  const { data: allCourses = [] } = useCourses();
  // [#2 2026-07-06] 과목 split — 옵션(useSubjects) + courseId→subjectId 리졸버(A안: ScheduleRow엔 subjectId 없음).
  const { data: allSubjects = [] } = useSubjects();
  const subjectOpts = useMemo(
    () => allSubjects.map((s) => ({ id: Number(s.id), name: s.name, color: (s as { color?: string }).color })),
    [allSubjects],
  );
  const subjectIdOf = useMemo(() => {
    const m = new Map(allCourses.map((c) => [Number(c.id), c.subjectId != null ? Number(c.subjectId) : undefined]));
    return (courseId: number) => m.get(courseId);
  }, [allCourses]);
  const [country, setCountry] = useState<CountryInfo | null>(null);
  // [KST 고정 축 2026-07-07] on=모든 컬럼을 KST 위치로 그림(같은 가로선=같은 실제 순간, 비교 최적).
  //  해외 컬럼은 칩에 현지시각 병기. off=컬럼별 현지 시각(자연스러움). 시차 편집·변환은 off일 때만.
  const [kstFixed, setKstFixed] = usePersistedState<boolean>("taco.cal.kstFixed", true);
  const [paneCountry, setPaneCountry] = useState<Partial<Record<SplitDim, CountryInfo | null>>>({});
  const paneTzOf = (dim: SplitDim) => (dim in paneCountry ? (paneCountry[dim] ?? null) : country);
  // ── 뷰 프리셋(TBO-12 P1) — DB 자산(calendar_view_presets). 직렬화는 lib/domain/presets 단일 소스 ──
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const createViewPreset = useCreateViewPreset();
  const applyPreset = (p: CalendarViewPreset) => {
    const st = presetToState(p);
    setView(st.view); setPeriod(st.period); setQ(st.q); setColorBy(st.colorBy as ColorBy);
    setFInstructors(st.fInstructors); setFStudents(st.fStudents); setFRooms(st.fRooms);
    // [오류2] 구 프리셋의 kinds → 과목 유사 옵션으로 승계(하위호환). 수업방식(fModes)은 프리셋 미보존(R-7).
    const subj = new Set(st.fSubjects);
    SUBJECT_KIND_OPTIONS.forEach((o) => { if (st.fKinds.has(o.kind)) subj.add(o.value); });
    setFSubjects(subj); setFStatuses(st.fStatuses); setFModes(st.fModes); setGroupOnly(st.groupOnly);
    setCountry(st.country); setPaneCountry(st.paneCountry);
    if (typeof st.kstFixed === "boolean") setKstFixed(st.kstFixed);
    if (typeof st.compactCols === "boolean") setCompactCols(st.compactCols);
    if (st.manualPanes) {
      const restored = st.manualPanes.map((mp) => ({ uid: mp.uid ?? paneUidRef.current++, dim: mp.dim, ids: mp.ids }));
      setManualPanes(restored);
      setPaneCountryU(Object.fromEntries(st.manualPanes.map((mp, i) => [restored[i].uid, mp.country ?? null])));
      setPaneModesU(Object.fromEntries(st.manualPanes.flatMap((mp, i) => mp.modes.size ? [[restored[i].uid, mp.modes] as const] : [])));
      paneUidRef.current = Math.max(paneUidRef.current, ...restored.map((mp) => mp.uid + 1), 1);
    } else {
      setManualPanes([]);
      setPaneCountryU({});
      setPaneModesU({});
    }
    setClosedPanes(new Set()); // 표 닫힘 상태 초기화 — 프리셋의 스플릿 구성을 그대로 복원
    setActivePresetId(Number(p.id));
    setMsg(`프리셋 적용 — ${p.name}`);
  };
  const saveCurrentPreset = async (name: string) => {
    await createViewPreset.mutateAsync(serializeViewPreset(name, {
      view, period, q, colorBy, fInstructors, fStudents, fRooms, fSubjects, fStatuses,
      // [오류2] kinds 필드 = 과목 유사 옵션(진단고사/상담) 역직렬화 — 구 스키마로 라운드트립
      fKinds: new Set(SUBJECT_KIND_OPTIONS.filter((o) => fSubjects.has(o.value)).map((o) => o.kind)),
      fModes, groupOnly, country, paneCountry, kstFixed, compactCols,
      manualPanes: manualPanes.map((mp) => ({
        uid: mp.uid,
        dim: mp.dim,
        ids: mp.ids,
        country: paneCountryU[mp.uid] ?? null,
        modes: new Set(paneModesU[mp.uid] ?? []),
      })),
    }));
  };
  // 학생 개별 시차(피드백 2026-07-03 #1): 학생 스플릿 컬럼은 그 학생의 국가 시간으로 자동 표시.
  //  전역/표별 국가를 명시 선택하면 그것이 우선(renderTimeGrid에서 그리드 tz가 컬럼 tz를 덮음).
  const studentTzOf = (id?: number): CountryInfo | undefined => {
    if (id == null) return undefined;
    if (id in studentTzOverride) {
      const ov = studentTzOverride[id]; // null = KST 고정(임시)
      return ov && ov.tz !== KST_TZ ? ov : undefined;
    }
    const st = allStudents.find((x) => Number(x.id) === id);
    const c = st?.country ? countryByCode(st.country) : undefined;
    return c && c.tz !== KST_TZ ? c : undefined;
  };
  // [피드백 2026-07-03 #3] 학생별 시차 수동 변경(뷰 전용 임시 — 저장은 유저 카드의 국가 수정).
  //  'id in map' = 오버라이드 존재(paneCountry와 동일 패턴 — 함수 통일), 값 null = KST 고정.
  const [studentTzOverride, setStudentTzOverride] = useState<Record<number, CountryInfo | null>>({});
  // [오류4 2026-07-06] x/y = 국기 버튼 뷰포트 좌표 — 팝오버를 fixed로 띄워 컬럼 overflow-hidden
  //  클리핑·옆 컬럼 가림에서 탈출(항상 최상위). 클릭 시점 좌표 고정(스크롤 시 재클릭).
  const [tzPickerFor, setTzPickerFor] = useState<{ colKey: string; studentId: number; x: number; y: number } | null>(null);

  // 학생 필터에 해외(비KR) 학생 포함 여부 — 개별 시차 컬럼도 조회 ±1일 확장이 필요(날짜 밀림).
  const anyStudentColTz = useMemo(
    () => [...fStudents].some((id) => studentTzOf(id) != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- studentTzOf는 allStudents·override 파생
    [fStudents, allStudents, studentTzOverride],
  );
  const anyTzActive = (country != null && country.tz !== KST_TZ)
    || Object.values(paneCountry).some((c) => c != null && c.tz !== KST_TZ)
    || Object.values(paneCountryU).some((c) => c != null && c.tz !== KST_TZ)
    || anyStudentColTz;
  // 국가 필터 모집단: 그 국가 학생 id 집합(country 미지정 학생은 KR로 간주 — 국내 기본).
  //  'US-W'(서부)는 학생 country 'US'와 매칭(대표 tz만 다른 동일 국가).
  const countryStudentIds = useMemo(() => {
    if (!country) return null;
    const want = country.code.split("-")[0];
    return new Set(
      allStudents.filter((st) => ((st.country ?? "KR").toUpperCase() === want)).map((st) => Number(st.id)),
    );
  }, [country, allStudents]);

  // [감사 M4] 시차 변환 결과 캐시 — filtered가 바뀔 때만 초기화, 같은 렌더/리렌더에서 tz별 1회만 변환.
  const tzRowsCacheRef = useRef<{ src: ScheduleRow[] | null; map: Map<string, ScheduleRow[]> }>({ src: null, map: new Map() });

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

  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
  // 기간(period)을 지정하면 **뷰 자체가 그 날짜들로 재구성**(피드백: 4일 선택=4일만 표시). 상한 14일.
  const dates = useMemo(() => {
    if (pickedDates.length) return [...new Set(pickedDates)].sort().slice(0, 14); // cherry-pick 우선
    if (!period) return weekDates(weekStart);
    const out: string[] = [];
    for (let d = period.from; d <= period.to && out.length < 14; d = addDaysISO(d, 1)) out.push(d);
    return out.length ? out : [period.from];
  }, [pickedDates, period, weekStart]);

  // 조회 기간(월/주/일/표). 표는 주간 기준.
  const range = useMemo(() => {
    if (view === "month") {
      const ym = anchor.slice(0, 7);
      const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
      return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
    }
    if (view === "day") return { from: anchor, to: anchor };
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [view, anchor, dates]);

  // [A안] 파생 selected: 리소스 필터 합계가 정확히 1명일 때 그 유저 = 개인 모드.
  //  (필터바 어떤 경로로든 1명만 남으면 자동으로 개인 스케줄 혜택 — 밴드·상세 카드·서버 파라미터)
  const selected: ScheduleResource | null = useMemo(() => {
    const total = fInstructors.size + fStudents.size + fRooms.size;
    if (total !== 1 || !resources) return null;
    if (fInstructors.size === 1) {
      const id = [...fInstructors][0];
      return resources.instructors.find((r) => Number(r.id) === id) ?? null;
    }
    if (fStudents.size === 1) {
      const id = [...fStudents][0];
      return resources.students.find((r) => Number(r.id) === id) ?? null;
    }
    const id = [...fRooms][0];
    return resources.rooms.find((r) => Number(r.id) === id) ?? null;
  }, [fInstructors, fStudents, fRooms, resources]);

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

  // 개인 필터 적용(명시적) — 해당 차원 필터를 그 1명으로 세팅(다른 리소스 차원은 비움).
  //  해제(null)는 리소스 필터만 클리어(상태·기간·국가 등 나머지 필터는 유지).
  const selectResource = (r: ScheduleResource | null) => {
    if (!r) { setFInstructors(new Set()); setFStudents(new Set()); setFRooms(new Set()); return; }
    const id = Number(r.id);
    setFInstructors(r.type === "instructor" ? new Set([id]) : new Set());
    setFStudents(r.type === "student" ? new Set([id]) : new Set());
    setFRooms(r.type === "room" ? new Set([id]) : new Set());
  };

  // 선택 자원 → 서버 필터(개인 스케줄) — 파생 selected 기반(필터와 항상 일치, 교집합 혼동 제거)
  const selQuery = useMemo(() => {
    if (isInstructor && myInstructorId != null) return { instructorId: myInstructorId };
    if (!selected) return {};
    if (selected.type === "instructor") return { instructorId: selected.id };
    if (selected.type === "room") return { roomId: selected.id };
    return { studentId: selected.id };
  }, [isInstructor, myInstructorId, selected]);

  // 기간 필터가 설정되면 뷰 파생 기간 대신 사용(우측 리스트가 기간 전체를 봄).
  // [L3] 월간 뷰는 월 그리드가 기준 — 기간 override를 무시(그리드-데이터 불일치 방지)
  const effRange = view === "month" ? range : (period ?? range);
  // [TBO-12 P0] 시차 뷰 조회 확장: 변환으로 날짜가 ±1일 밀린 세션(예: 월 12:30 KST = 일 23:30 ET,
  //  일 오전 KST = 토 심야 ET)이 그리드 날짜 축 밖 데이터라 미표시되던 한계 → 조회만 ±1일 넓힌다.
  //  KST 리스트·시수·건수는 아래 inRange로 원래 기간을 유지(오염 방지), 그리드는 변환 후
  //  컬럼 날짜 매칭이 표시 범위를 자연 결정.

  // [이슈3] 표별 캘린더 범위가 전역 기간을 벗어나면 그만큼 조회 범위 확장(그 날짜 세션도 로드).
  const pickedBounds = Object.values(panePicked)
    .filter((a): a is string[] => !!a?.length)
    .map((a) => { const s = [...a].sort(); return { from: s[0], to: s[s.length - 1] }; });
  const paneBounds = [...Object.values(paneRange).filter((r): r is { from: string; to: string } => !!r?.from), ...pickedBounds];
  const spanFrom = paneBounds.reduce((a, r) => (r.from < a ? r.from : a), effRange.from);
  const spanTo = paneBounds.reduce((a, r) => { const t = r.to && r.to >= r.from ? r.to : r.from; return t > a ? t : a; }, effRange.to);
  const baseRange = { from: spanFrom, to: spanTo };
  const fetchRange = anyTzActive
    ? { from: addDaysISO(baseRange.from, -1), to: addDaysISO(baseRange.to, 1) }
    : baseRange;

  // [TBO-14] 스케줄 데이터층 = TanStack Query 단일 소스(useCalendarSchedule). 기간·선택자원 키.
  //  · rows(로컬)는 이 쿼리를 feed 받아 낙관적 편집(드래그·리사이즈·생성·삭제)에만 사용 — 즉시 반영 유지.
  //  · 세션 변경(PATCH/생성/삭제·강사출결)은 qk.schedule.all 무효화 → 이 쿼리 자동 refetch → rows 재동기화.
  //    → 출석부/상세에서 강사 출결을 바꿔도 캘린더가 자동 갱신(M1 invalidate 단절 근본 해소).
  const scheduleQ = useCalendarSchedule({ ...fetchRange, ...selQuery });
  useEffect(() => {
    if (scheduleQ.data) setRows(scheduleQ.data); // 서버 데이터 → rows 동기화(리페치 시 reconcile)
  }, [scheduleQ.data]);
  useEffect(() => {
    if (scheduleQ.isError) setMsg("백엔드 API에 연결할 수 없습니다. 서버 상태를 확인하세요.");
  }, [scheduleQ.isError]);
  // load() = 스케줄 쿼리 무효화(refetch→위 useEffect가 rows reconcile). 낙관적 커밋 후 서버 확정에 사용.
  const load = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: qk.schedule.all });
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
            ? PALETTE[r.instructorId % PALETTE.length]
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
          ? r.instructorName
          : colorBy === "room"
            ? (r.roomName ?? "—")
            : (r.studentNames ?? []).join(", ") || r.courseName,
    [colorBy],
  );

  // ── 필터 적용 ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      // 강사·학생 = 합집합(OR), 강의실 = AND — 동시 다중선택 교집합 버그 수정(lantiv.matchesResourceFilter).
      if (!matchesResourceFilter(r, { instructors: fInstructors, students: fStudents, rooms: fRooms })) return false;
      if (pickedDates.length && !dates.includes(r.sessionDate)) return false; // cherry-pick — 그리드·리스트·시수 동일 모집단
      // [오류2] 과목 = 실제 과목명 ∪ 종류 유사 옵션(진단고사/상담) — 같은 필터 내 합집합
      if (!matchesSubjectFilter(r, fSubjects)) return false;
      // Lantiv 상태 필터(예정/출석/지각/결강/보강) — 세션 status + 강사·학생 출결 조합(lib/domain/lantiv)
      if (!matchesStatusFilter(r, attBySession.get(Number(r.id)) ?? [], fStatuses)) return false;
      // [오류2] 수업방식(대면/비대면) — 미지정=in_person 하위호환
      if (fModes.size && !fModes.has((r.mode ?? "in_person") as SessionModeFilter)) return false;
      if (groupOnly && !isGroupSession(r)) return false;
      // 국가 필터: 그 국가 학생이 코호트에 포함된 세션만(해외 학생에게 보낼 시간표 추출용)
      if (countryStudentIds && !(r.studentIds ?? []).some((id) => countryStudentIds.has(Number(id)))) return false;
      if (needle) {
        const hay =
          `${r.courseName} ${r.subjectName} ${r.instructorName} ${r.roomName ?? ""} ${(r.studentNames ?? []).join(" ")} ${r.topic ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, fInstructors, fSubjects, fRooms, fStudents, fStatuses, fModes, groupOnly, attBySession, countryStudentIds, pickedDates, dates]);

  const anyFilter =
    q.trim() !== "" || fInstructors.size || fSubjects.size || fRooms.size || fStudents.size ||
    fStatuses.size || fModes.size || groupOnly || period != null || pickedDates.length || country != null;
  const clearFilters = () => {
    setQ("");
    setFInstructors(new Set());
    setFSubjects(new Set());
    setFRooms(new Set());
    setFStudents(new Set());
    setFStatuses(new Set());
    setFModes(new Set());
    setPickedDates([]);
    setGroupOnly(false);
    setPeriod(null);
    setCountry(null);
    setPaneCountry({});
    setManualPanes([]);
    setPaneCountryU({});
    setPaneModesU({});
    setStudentTzOverride({});
    setActivePresetId(null);
  };

  // [TBO-12 P0] tz 확장 조회분(±1일)은 그리드 변환 표시 전용 — KST 기준 리스트·시수·건수는 원래 기간만.
  const inRange = useMemo(
    () => (anyTzActive ? filtered.filter((r) => r.sessionDate >= effRange.from && r.sessionDate <= effRange.to) : filtered),
    [filtered, anyTzActive, effRange.from, effRange.to],
  );
  const hrs = teachingHours(inRange);

  // ── 스플릿(피드백 2026-07-02 최종, Lantiv): 필터 선택에서 **자동 파생** ──
  //  · 강사+학생 둘 다 선택 → 표 2개(강사 표 | 학생 표), 각 표 = (날짜 × 그 차원 선택) 데일리 스플릿
  //  · 한 차원만 2명 이상 → 단일 그리드 데일리 스플릿(월요일 열 안에 사람별 서브컬럼)
  //  · 표 ✕ 닫기 → 남은 화면은 원래(단일 그리드) 렌더, 필터 선택은 그대로 유지(상태 저장)
  const instPicks: MixedPick[] = useMemo(
    () => (resources?.instructors ?? []).filter((r) => fInstructors.has(Number(r.id))).map((r) => ({ id: Number(r.id), name: r.name, type: "instructor" as const })),
    [resources, fInstructors],
  );
  const studPicks: MixedPick[] = useMemo(
    () => (resources?.students ?? []).filter((r) => fStudents.has(Number(r.id))).map((r) => ({ id: Number(r.id), name: r.name, type: "student" as const })),
    [resources, fStudents],
  );
  const roomPicks: MixedPick[] = useMemo(
    () => rooms.filter((r) => fRooms.has(Number(r.id))).map((r) => ({ id: Number(r.id), name: r.name, type: "room" as const })),
    [rooms, fRooms],
  );
  // ✕로 닫은 표(차원) — 필터는 유지한 채 표만 접음. 해당 차원 선택이 비면 자동 해제.
  const [closedPanes, setClosedPanes] = useState<Set<SplitDim>>(new Set());
  // [C-2 명시화] 이 effect는 picks의 **길이**만 읽는다(내용 아님) — 선택이 0이 되면 닫힘 상태를 해제.
  //  따라서 deps = [instPicks.length, studPicks.length]가 완전(exhaustive)하다(배열 전체 불필요).
  useEffect(() => {
    setClosedPanes((prev) => {
      const n = new Set(prev);
      if (instPicks.length === 0) n.delete("instructor");
      if (studPicks.length === 0) n.delete("student");
      return n;
    });
  }, [instPicks.length, studPicks.length]);
  const panes = useMemo(() => {
    const out: { dim: SplitDim; title: string; picks: MixedPick[] }[] = [];
    if (instPicks.length && !closedPanes.has("instructor"))
      out.push({ dim: "instructor", title: `강사 시간표 (${Math.min(instPicks.length, MAX_SPLIT)})`, picks: instPicks.slice(0, MAX_SPLIT) });
    if (studPicks.length && !closedPanes.has("student"))
      out.push({ dim: "student", title: `학생 시간표 (${Math.min(studPicks.length, MAX_SPLIT)})`, picks: studPicks.slice(0, MAX_SPLIT) });
    return out;
  }, [instPicks, studPicks, closedPanes]);
  const twoPanes = panes.length === 2 && (view !== "month");
  // 단일 그리드 데일리 스플릿 대상(표 2개가 아닐 때): 남은 표 1개(≥2명) 또는 강의실 다중선택
  // [렌더 최적화] 파생 배열 메모화 — 매 렌더 새 배열로 columns 재계산·자식 리렌더 유발 방지
  const singleSplitPicks: MixedPick[] = useMemo(() => !twoPanes
    ? (panes[0]?.picks.length ?? 0) >= 2
      ? panes[0].picks
      : roomPicks.length >= 2 && instPicks.length === 0 && studPicks.length === 0
        ? roomPicks.slice(0, MAX_SPLIT)
        : []
    : [], [twoPanes, panes, roomPicks, instPicks.length, studPicks.length]);
  const isSplit = (twoPanes || singleSplitPicks.length >= 2) && view !== "month";
  const splitDim: SplitDim | null = twoPanes ? "instructor" : (singleSplitPicks[0]?.type ?? null);

  // 컬럼: 데일리 스플릿=(날짜×리소스, 표별 prefix로 key 유일) · week=날짜 · day=강의실
  type Col = {
    key: string; label: string; sub?: string; date: string; roomId?: number;
    noRoom?: boolean; // 일간 '미지정' 컬럼(강의실 없는 세션)
    resType?: SplitDim; resId?: number; firstOfDate?: boolean;
    tzc?: CountryInfo; // 학생 개별 시차(country 파생 — 피드백 2026-07-03 #1)
  };
  // [이슈1 2026-07-03] paneDates: 표(패널)별 날짜 배열 — 왼쪽 3일·오른쪽 5일처럼 표마다 기간을 다르게.
  //  미지정 시 전역 dates 사용(기존 동작).
  const colsFor = (picks: MixedPick[], prefix = "", paneDates: string[] = dates): Col[] =>
    buildMixedSplitColumns(view === "day" ? [anchor] : paneDates, picks).map((c) => ({
      key: prefix + c.key, label: c.label,
      sub: view === "week" || period ? `${WD[weekdayOf(c.date)]} ${c.date.slice(5)}` : undefined,
      date: c.date, roomId: c.roomId, resType: c.resType, resId: c.resId, firstOfDate: c.firstOfDate,
      tzc: c.resType === "student" ? studentTzOf(c.resId) : undefined,
    }));
  // 표별 날짜 = 그 표의 캘린더 범위(from~to, 최대 14일). 미설정이면 전역 dates.
  const paneDatesOf = (dim: SplitDim): string[] => {
    const picked = panePicked[dim];
    if (picked?.length) return [...new Set(picked)].sort().slice(0, 14); // cherry-pick 우선(정렬·중복 제거·상한 14)
    const r = paneRange[dim];
    if (!r?.from) return dates;
    const out: string[] = [];
    const to = r.to && r.to >= r.from ? r.to : r.from;
    for (let d = r.from; d <= to && out.length < 14; d = addDaysISO(d, 1)) out.push(d);
    return out.length ? out : dates;
  };
  // [렌더 최적화] 단일 그리드 컬럼 메모화(스플릿 곱·요일 파생 재계산 방지)
  const columns: Col[] = useMemo(() => singleSplitPicks.length >= 2
    ? colsFor(singleSplitPicks)
    : view === "day"
      ? [
          ...rooms.map((r) => ({ key: `r${r.id}`, label: r.name, date: anchor, roomId: r.id }) as Col),
          { key: "r-none", label: "미지정", date: anchor, noRoom: true } as Col, // [L1] 강의실 없는 세션도 보이게
        ]
      : dates.map((d) => ({ key: d, label: WD[weekdayOf(d)], sub: d.slice(5), date: d })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colsFor는 view/dates/period/anchor 클로저(아래 deps로 충분)
    // studentTzOverride·allStudents: 학생 컬럼 개별 시차(자동 국가·수동 변경)가 컬럼 tzc에 반영되므로 필수
    [singleSplitPicks, view, rooms, anchor, dates, period, studentTzOverride, allStudents]);

  const picksForManualPane = (mp: ManualPaneState): MixedPick[] => {
    const opts =
      mp.dim === "instructor" ? (resources?.instructors ?? []).map((r) => ({ id: Number(r.id), name: r.name }))
        : mp.dim === "student" ? (resources?.students ?? []).map((r) => ({ id: Number(r.id), name: r.name }))
          : mp.dim === "room" ? rooms.map((r) => ({ id: Number(r.id), name: r.name }))
            : subjectOpts.map((s) => ({ id: s.id, name: s.name }));
    return mp.ids.map((id) => ({ id, name: opts.find((o) => o.id === id)?.name ?? `#${id}`, type: mp.dim }));
  };

  const moveManualPane = (uid: number, dir: -1 | 1) => {
    setManualPanes((prev) => {
      const idx = prev.findIndex((p) => p.uid === uid);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return next;
    });
  };

  const autoTzStudentPanes = useMemo(() => {
    if (manualPanes.length || view === "month" || studPicks.length < 2) return [];
    const tzKeys = new Set(studPicks.map((p) => studentTzOf(p.id)?.tz ?? KST_TZ));
    return tzKeys.size > 1 ? studPicks.map((p) => ({ pick: p, country: studentTzOf(p.id) ?? null })) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- studentTzOf는 allStudents·override 파생
  }, [manualPanes.length, view, studPicks, allStudents, studentTzOverride]);

  const rowsOfColumn = (c: Col, src: ScheduleRow[] = filtered) =>
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
      return allBlocks
        .filter((b) => b.ownerType === c.resType && Number(b.ownerId) === c.resId)
        .map((b) => toBand(b, true)).filter(nonNull);
    }
    if (!selBlocks.length) return [];
    return selBlocks
      .filter((b) => selected?.type !== "room" || c.roomId == null || c.roomId === selected.id)
      .map((b) => toBand(b, true)).filter(nonNull);
  };

  // ── 가용/불가(Block) — 밴드 표시 + 클릭 삭제. 생성은 "스케줄 추가" 모달의 '가용·불가' 탭에서. ──
  // [TBO-14 C2b] 밴드 편집 후 가용/불가 쿼리 무효화 → allBlocks refetch → selBlocks 파생 자동 재계산.
  const reloadSelBlocks = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.availability.all });
  }, [qc]);

  function approvalImpactOf(e: unknown): AvailabilityImpact[] | null {
    const data = (e as { response?: { data?: { approvalRequired?: boolean; impactedSessions?: AvailabilityImpact[] } } })?.response?.data;
    return data?.approvalRequired ? (data.impactedSessions ?? []) : null;
  }

  function availabilitySummary(body: AvailabilityUpsertBody): string {
    return `${AVAILABILITY_KIND_LABEL[body.kind ?? "available"]} · ${WD[body.weekday]} ${body.startTime}~${body.endTime}`;
  }

  function alertAvailabilityError(message: string) {
    alert(message);
    setMsg(message);
  }

  function openAvailabilityApprovalFromError(e: unknown, draft: AvailabilityApprovalSeed): boolean {
    const impacted = approvalImpactOf(e);
    if (!impacted) return false;
    setAvailabilityApproval({ ...draft, impacted } as AvailabilityApprovalDraft);
    setMsg("이미 잡힌 수업에 영향이 있어 승인 요청이 필요합니다.");
    return true;
  }

  async function submitAvailabilityApproval(draft: AvailabilityApprovalDraft) {
    const input: CreateScheduleRequestBody =
      draft.action === "delete"
        ? { requestKind: "availability_delete", targetAvailabilityId: draft.targetAvailabilityId }
        : {
            requestKind: "availability_upsert",
            targetAvailabilityId: draft.body.id,
            availabilityOwnerType: draft.body.ownerType,
            availabilityOwnerId: draft.body.ownerId,
            availabilityKind: draft.body.kind ?? "available",
            availabilityWeekday: draft.body.weekday,
            availabilityStartTime: draft.body.startTime,
            availabilityEndTime: draft.body.endTime,
            availabilityEffectiveFrom: draft.body.effectiveFrom,
            availabilityEffectiveTo: draft.body.effectiveTo,
          };
    try {
      await api.scheduleRequests.create(input);
      setAvailabilityApproval(null);
      setCreating(null);
      reloadSelBlocks();
      qc.invalidateQueries({ queryKey: qk.scheduleRequests.all });
      setMsg("승인 요청을 보냈습니다 — 승인센터에서 처리됩니다.");
    } catch (e) {
      const serverMsg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const detail = Array.isArray(serverMsg) ? serverMsg[0] : serverMsg;
      alertAvailabilityError(`요청 실패${detail ? ` — ${detail}` : ""}`);
    }
  }

  // 가용/불가 블록 생성(모달에서 호출)
  async function createBlock(body: AvailabilityUpsertBody, options: { closeOnSuccess?: boolean } = {}): Promise<boolean> {
    try {
      await api.availability.upsert(body);
      if (options.closeOnSuccess !== false) setCreating(null);
      // [버그수정 2026-07-03 이슈3·4] 스플릿 컬럼 밴드는 allBlocks 소스라 항상 갱신해야 새 블록(학생 불가·
      //  가용 초록)이 즉시 렌더됨. 기존엔 selected==owner일 때만 갱신 → 다른 유저 컬럼에 추가하면 미표시.
      reloadSelBlocks(); // invalidate(qk.availability.all) → allBlocks refetch → 전체 컬럼·선택 유저 밴드 동시 갱신
      return true;
    } catch (e) {
      if (openAvailabilityApprovalFromError(e, { action: "upsert", body, summary: availabilitySummary(body) })) return false;
      // 겹침(409) 등 백엔드 메시지를 그대로 노출 — "이미 지정된 불가시간과 겹칩니다" 경고.
      const err = e as { response?: { data?: { message?: string } } };
      alertAvailabilityError(err.response?.data?.message ?? "가용/불가 저장 실패");
      return false;
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
    if (!confirm("이 시간 블록을 삭제할까요?")) return;
    try { await api.availability.remove(id); reloadSelBlocks(); } catch (e) {
      if (openAvailabilityApprovalFromError(e, { action: "delete", targetAvailabilityId: id, summary: `${AVAILABILITY_KIND_LABEL[b?.kind ?? "available"]} 삭제` })) return;
      alertAvailabilityError("삭제 실패");
    }
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
        await api.availability.remove(c.id);
      } else if (scope === "this_and_following") {
        await api.availability.upsert({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.date, -1) });
      } else {
        await api.availability.upsert({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.date, -1) });
        await api.availability.upsert({ ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: addDaysISO(c.date, 7), effectiveTo: orig.effectiveTo });
      }
      reloadSelBlocks();
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
      const err = e as { response?: { data?: { message?: string } } };
      alertAvailabilityError(err.response?.data?.message ?? "삭제 실패"); reloadSelBlocks();
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
        await api.availability.upsert({ id: c.id, ...newPos, effectiveFrom: orig?.effectiveFrom, effectiveTo: orig?.effectiveTo });
      } else if (scope === "this_and_following") {
        // 원본을 이번 주 직전까지로 제한 + 새 규칙을 이번 주부터.
        await api.availability.upsert({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.origDate, -1) });
        await api.availability.upsert({ ...newPos, effectiveFrom: c.newDate, effectiveTo: orig.effectiveTo });
      } else {
        // 이번 주만: 원본 분할(이번 주 직전까지 + 다음 주부터 재개) + 이번 주 1회 새 위치.
        await api.availability.upsert({ id: c.id, ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: orig.effectiveFrom, effectiveTo: addDaysISO(c.origDate, -1) });
        await api.availability.upsert({ ...owner, kind: orig.kind, weekday: orig.weekday, startTime: orig.startTime, endTime: orig.endTime, effectiveFrom: addDaysISO(c.origDate, 7), effectiveTo: orig.effectiveTo });
        await api.availability.upsert({ ...newPos, effectiveFrom: c.newDate, effectiveTo: c.newDate });
      }
      reloadSelBlocks();
    } catch (e) {
      if (orig) {
        const fallback = {
          action: "upsert",
          body: { id: c.id, ...newPos, effectiveFrom: orig.effectiveFrom, effectiveTo: orig.effectiveTo },
          summary: `${AVAILABILITY_KIND_LABEL[c.kind]} 변경`,
        } as const;
        if (openAvailabilityApprovalFromError(e, fallback)) return;
      }
      const err = e as { response?: { data?: { message?: string } } };
      alertAvailabilityError(err.response?.data?.message ?? "적용 실패");
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

  // 충돌(Conflict)을 실제 데이터(강사명·상대 스케줄)로 사람이 읽을 수 있게 변환.
  const CONFLICT_LABEL: Record<string, string> = { double_book: "이중예약", unavailable: "불가시간 겹침", room_capacity: "강의실 정원 초과" };
  function resourceName(c: Conflict): string {
    if (c.resource === "instructor") return resources?.instructors.find((i) => i.id === c.resourceId)?.name ?? `강사#${c.resourceId}`;
    if (c.resource === "room") return (resources?.rooms ?? rooms).find((r) => r.id === c.resourceId)?.name ?? `강의실#${c.resourceId}`;
    if (c.resource === "student") return resources?.students.find((s) => s.id === c.resourceId)?.name ?? `학생#${c.resourceId}`;
    return "";
  }
  function describeConflicts(cs: Conflict[]): string {
    return cs
      .map((c) => {
        const who = c.resource ? `${c.resource === "instructor" ? "강사" : c.resource === "room" ? "강의실" : "학생"} ${resourceName(c)}` : "";
        const what = CONFLICT_LABEL[c.type] ?? c.type;
        // 상대 스케줄: 이중예약이면 해당 세션(과목·요일·시각·강사), 불가시간이면 백엔드 detail(겹친 불가 시각).
        const other = c.sessionId != null ? rows.find((r) => r.id === c.sessionId) : undefined;
        // 상대 스케줄: {강사명} · {강의명} (요일 시각) — 실제 백엔드 데이터. 불가시간이면 detail(시각).
        const otherStr = other
          ? ` — ${other.instructorName} · ${other.courseName} (${WD[other.weekday]} ${other.startTime ?? ""}–${other.endTime ?? ""})`
          : c.detail ? ` — ${c.detail}` : "";
        return `· ${who} ${what}${otherStr}`.replace(/\s+/g, " ").trim();
      })
      .join("\n");
  }

  // ── 낙관적 업데이트(렌더 레이턴시 해소) ──
  // 프론트에서 먼저 화면을 반영하고, 백엔드 응답으로 확정(load)하거나 실패 시 스냅샷으로 롤백.
  function applyRowPatch(r: ScheduleRow, patch: SchedulePatchBody): ScheduleRow {
    const next: ScheduleRow = { ...r };
    if (patch.sessionDate) { next.sessionDate = patch.sessionDate; next.weekday = weekdayOf(patch.sessionDate); }
    if (patch.startTime) next.startTime = patch.startTime;
    if (patch.endTime) next.endTime = patch.endTime;
    if (patch.startTime || patch.endTime) {
      const s = toMin(next.startTime ?? "00:00");
      // [R-9] endTime<start = 익일 종료(자정 크로스) — +1440 래핑(BE durationFrom과 동일 규칙)
      let e = next.endTime ? toMin(next.endTime) : s + next.durationMinutes;
      if (next.endTime && e < s) e += 1440;
      next.durationMinutes = Math.max(1, e - s);
      if (e >= 1440) next.endTime = undefined; // 크로스는 endTime 미보유(durationMinutes 파생 — BE 저장 규칙)
    }
    if (patch.durationMinutes != null) {
      next.durationMinutes = patch.durationMinutes;
      if (next.startTime && !patch.endTime) {
        const em = toMin(next.startTime) + patch.durationMinutes;
        next.endTime = em >= 1440 ? undefined : fromMin(em); // [R-9] 크로스면 파생(무효 'HH:mm' 금지)
      }
    }
    if (patch.roomId !== undefined) next.roomId = patch.roomId;
    if (patch.instructorId !== undefined) next.instructorId = patch.instructorId;
    if (patch.status) next.status = patch.status as ScheduleRow["status"];
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.memo !== undefined) next.memo = patch.memo;
    return next;
  }

  // ── PATCH 적용(낙관적 + 충돌 시 확인 후 force) ──
  async function applyPatch(id: number, patch: SchedulePatchBody) {
    const snapshot = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? applyRowPatch(r, patch) : r))); // 즉시 반영
    try {
      const res = await api.schedule.update(id, patch);
      if (res.updated > 1) setMsg(`반복 일정 ${res.updated}건 함께 수정되었습니다.`);
      await load(); // 서버 확정으로 reconcile
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        if (confirm(`충돌 ${cs.length}건:\n${describeConflicts(cs)}\n\n그래도 적용할까요?`)) {
          // [M4] force 재시도도 실패할 수 있음(네트워크·400) — 미처리 거부/유령 낙관 상태 방지
          try { await api.schedule.update(id, { ...patch, force: true }); await load(); }
          catch { setRows(snapshot); setMsg("수정 실패"); }
        } else {
          setRows(snapshot); // 취소 → 롤백
        }
      } else {
        setRows(snapshot); // 실패 → 롤백
        // [개방 2026-07-06] 서버 사유 표면화 — 예: 학생 재배정 시 "코스 수강생이 아님"(400) 원인 안내
        const serverMsg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setMsg(`수정 실패${serverMsg ? ` — ${Array.isArray(serverMsg) ? serverMsg[0] : serverMsg}` : ""}`);
      }
    }
  }

  function requestChange(r: ScheduleRow, patch: SchedulePatchBody, label: string) {
    // [TBO-16 #8] 수업 변경은 manager 이상(BE 403) — 강사는 요청·가용/불가만
    if (isInstructor) { setMsg("수업 변경은 매니저 승인이 필요합니다 — 새 수업은 '+ 추가'로 요청하세요."); return; }
    // [M5] SessionEditFields가 이미 scope를 골라 보냈으면 RecurrencePrompt 재질문 생략(이중 질문 방지)
    if (r.seriesId != null && !("scope" in patch)) setPending({ row: r, patch, label });
    else applyPatch(r.id, patch);
  }

  // 낙관적 생성용 임시 행(음수 id) — resources에서 라벨 파생. load()로 곧 서버 행으로 교체됨.
  function optimisticRow(body: ScheduleCreateBody): ScheduleRow {
    const c = resources?.courses.find((x) => x.id === body.courseId);
    const start = body.startTime;
    // [R-9] 자정 크로스: endTime<start = 익일 종료(+1440), 파생 종료가 24:00 이상이면 endTime 미설정
    //  (BE 저장 규칙과 동일 — durationMinutes 파생. '25:00' 같은 무효 문자열 금지).
    const dur = body.endTime
      ? ((toMin(body.endTime) - toMin(start) + 1440) % 1440) || 1
      : (body.durationMinutes ?? c?.durationMinutes ?? 60);
    const endMin = toMin(start) + dur;
    return {
      id: -Date.now(), courseId: body.courseId,
      instructorId: body.instructorId ?? c?.instructorId ?? 0, roomId: body.roomId,
      sessionDate: body.sessionDate, weekday: weekdayOf(body.sessionDate),
      startTime: start, endTime: endMin >= 1440 ? undefined : fromMin(endMin), durationMinutes: Math.max(1, dur),
      status: (body.status as ScheduleRow["status"]) ?? "scheduled", color: body.color, memo: body.memo,
      courseName: c?.name ?? "수업", subjectName: c?.subjectName ?? "",
      instructorName: c?.instructorName ?? "", roomName: rooms.find((r) => r.id === body.roomId)?.name,
      studentIds: [], studentNames: [],
    } as ScheduleRow;
  }

  // 세션 생성(추가, 낙관적). 강사는 본인(myInstructorId)으로 강제 — 권한 게이팅(데모; 실제는 백엔드 가드).
  // [TBO-16 #8·#9] 강사는 직접 배정 불가(BE 403) → **승인 요청(schedule-requests)으로 전환**.
  //  같은 입력·같은 검증(서버 validateSessionInput 재사용), 승인 시 매니저 경로로 세션 생성.
  async function createSession(body: ScheduleCreateBody) {
    if (isInstructor) {
      try {
        await api.scheduleRequests.create({
          courseId: body.courseId, instructorId: myInstructorId ?? body.instructorId, roomId: body.roomId,
          sessionDate: body.sessionDate, startTime: body.startTime, endTime: body.endTime,
          durationMinutes: body.durationMinutes, studentIds: body.studentIds, topic: body.topic, kind: body.kind,
        });
        setCreating(null);
        setMsg("승인 요청을 보냈습니다 — 매니저 승인 시 캘린더에 반영됩니다.");
        qc.invalidateQueries({ queryKey: qk.scheduleRequests.all }); // 배지·승인센터 동일 모집단 갱신
      } catch (e) {
        const err = e as { response?: { data?: { message?: string } } };
        setMsg(err.response?.data?.message ?? "요청 실패 — 입력을 확인하세요");
      }
      return;
    }
    const safe: ScheduleCreateBody = body;
    const snapshot = rows;
    setRows((rs) => [...rs, optimisticRow(safe)]); // 즉시 반영
    setCreating(null);
    try {
      await api.schedule.create(safe);
      await load();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        if (confirm(`충돌 ${cs.length}건:\n${describeConflicts(cs)}\n\n그래도 추가할까요?`)) {
          // [M4] force 재시도 실패 시에도 롤백(미처리 거부 방지)
          try { await api.schedule.create({ ...safe, force: true }); await load(); }
          catch { setRows(snapshot); setMsg("스케줄 추가 실패"); }
        } else {
          setRows(snapshot); // 취소 → 롤백
        }
      } else {
        setRows(snapshot);
        setMsg("스케줄 추가 실패");
      }
    }
  }

  // 반복 일정 생성(낙관적, 일괄). 같은 seriesId로 묶어 한 번에 생성 — 충돌은 자동 force(개별 확인 생략).
  async function createSeries(bodies: ScheduleCreateBody[]) {
    if (bodies.length === 0) return;
    if (bodies.length === 1) return createSession(bodies[0]);
    const safe = bodies.map((b) => (isInstructor && myInstructorId != null ? { ...b, instructorId: myInstructorId } : b));
    const snapshot = rows;
    setRows((rs) => [...rs, ...safe.map(optimisticRow)]); // 즉시 반영
    setCreating(null);
    const createdIds: number[] = []; // [M6] 중도 실패 시 보상 삭제용(반쪽 시리즈 잔존 방지)
    try {
      for (const b of safe) {
        try { const res = await api.schedule.create(b); createdIds.push(res.row.id); }
        catch (e) {
          const err = e as { response?: { status?: number } };
          if (err.response?.status === 409) { const res = await api.schedule.create({ ...b, force: true }); createdIds.push(res.row.id); }
          else throw e;
        }
      }
      setMsg(`반복 일정 ${safe.length}건을 추가했습니다.`);
      await load();
    } catch {
      // 보상: 이미 생성된 세션 삭제(서버에 반쪽 시리즈가 남지 않게 — 벌크 API 전까지의 최소 조치)
      await Promise.allSettled(createdIds.map((cid) => api.schedule.remove(cid)));
      setRows(snapshot);
      setMsg("반복 일정 추가 실패 — 생성분을 되돌렸습니다");
      await load();
    }
  }

  // 세션 삭제(낙관적). 확인 후 즉시 제거 → 실패 시 롤백.
  async function deleteSession(id: number) {
    if (isInstructor) { setMsg("수업 삭제는 매니저 권한입니다."); return; } // [TBO-16 #8]
    if (!confirm("이 스케줄을 삭제할까요? (삭제 내역은 DB에 보존됩니다)")) return;
    const snapshot = rows;
    setRows((rs) => rs.filter((r) => r.id !== id)); // 즉시 반영
    setEditing(null);
    setSelEvent(null);
    try {
      await api.schedule.remove(id);
      setMsg("스케줄을 삭제했습니다.");
      await load();
    } catch {
      setRows(snapshot); // 실패 → 롤백
      setMsg("삭제 실패");
    }
  }

  // 붙여넣기 — 커서 시각을 시작으로 복제 생성(cloneSessionBody: 단건·scheduled·출결/시리즈 미승계).
  //  충돌·FK·권한(강사=본인 강제)은 기존 createSession 경로 재사용(409 confirm force).
  //  [버그수정 2026-07-02] 다른 학생 컬럼에 붙여넣기: 대상 학생의 활성 수강 기반으로 코스 재배정
  //  (원본 코스 수강 중이면 유지 → 같은 과목 코스 → 첫 활성 코스, 없으면 중단 — 유령 세션 방지).
  function pasteAt(src: ScheduleRow, target: PasteTarget) {
    if (isInstructor) { setMsg("수업 복제 배정은 매니저 권한입니다 — '+ 추가'로 요청하세요."); return; } // [TBO-16 #8]
    let body = cloneSessionBody(src, target);
    if (target.resType === "student" && target.resId != null
        && !(src.studentIds ?? []).map(Number).includes(Number(target.resId))) {
      const cid = resolvePasteCourseId(Number(src.courseId), Number(target.resId), allEnrollments, allCourses);
      if (cid == null) {
        setMsg("대상 학생의 활성 수강이 없어 붙여넣을 수 없습니다 — 수강 등록 후 다시 시도하세요");
        return;
      }
      if (cid !== Number(src.courseId)) body = { ...body, courseId: cid };
    }
    createSession(body);
  }

  // 키보드: Ctrl/⌘+C=선택 수업 복사 · Ctrl/⌘+V=커서 위치 붙여넣기 · Esc=커서·선택 해제.
  //  입력 요소 포커스 중에는 무시(폼 타이핑 방해 금지).
  // [C-2 명시화] latest-ref 패턴 — 핸들러 본문을 매 렌더 ref에 최신화하고, 리스너는 mount 1회만 등록.
  //  종전엔 [rows,selEvent,clip,cursor,canAdd]에 eslint-disable로 pasteAt를 누락(stale closure 위험).
  //  이제 kbdRef.current가 항상 최신 클로저(rows·pasteAt·allEnrollments 등 포함)라 재등록·누락 걱정 없음.
  const kbdRef = useRef<(e: KeyboardEvent) => void>(() => {});
  kbdRef.current = (e: KeyboardEvent) => {
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
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => kbdRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // [감사 M6] 국가(시차) 변경 시 stale 커서·선택 해제 — KST 좌표 커서가 tz 뷰에 남아 오배치되는 것 방지.
  useEffect(() => { setCursor(null); setSelEvent(null); }, [country, paneCountry]);

  // 다운로드 파일명: {선택유저명+역할}_{YYMMDD}_{뷰}.ext  (예: 김민수강사_260630_weekly.png)
  // 우측 패널에서 자원을 고르면 그 자원, 아니면 로그인한 본인(토큰), 그것도 없으면 전체스케줄.
  function downloadName(ext: string) {
    const ROLE_SUFFIX: Record<string, string> = { instructor: "강사", student: "학생", room: "강의실" };
    let who = "전체스케줄";
    if (selected) {
      who = `${selected.name}${ROLE_SUFFIX[selected.type] ?? ""}`;
    } else {
      const claims = currentClaims();
      if (claims) who = `${claims.name}${roleLabel[(claims.roles?.[0] ?? "") as AccountRole] ?? ""}`;
    }
    const yymmdd = anchor.slice(2, 4) + anchor.slice(5, 7) + anchor.slice(8, 10);
    const viewWord = view === "month" ? "monthly" : view === "week" ? "weekly" : "daily";
    const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, ""); // 파일명 금지문자·공백 제거
    const tzTag = country && country.tz !== KST_TZ ? `_${country.code}` : ""; // 예: _US — 시차 뷰 캡처 구분
    return `${safe(who)}_${yymmdd}_${viewWord}${tzTag}.${ext}`;
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
    // [개방 2026-07-06] 학생 컬럼 드롭 → 1:1 수업이면 그 학생으로 재배정(studentIds 교체 —
    //  BE가 "그 코스 활성 수강생의 부분집합" 검증, 아니면 400 롤백+메시지).
    //  단체(코호트 2명+)는 임의 재배정 방지 — 코호트 유지, 시간만 이동(안내 토스트).
    const curCohort = (orig.studentIds ?? []).map(Number);
    const dropStudent = d.resType === "student" && d.resId != null ? Number(d.resId) : null;
    const reassignStudent = dropStudent != null && !curCohort.includes(dropStudent) && curCohort.length === 1;
    if (dropStudent != null && !curCohort.includes(dropStudent) && curCohort.length > 1)
      setMsg("단체 수업은 학생 재배정 없이 시간만 이동합니다(코호트 유지)");
    // [#2] 과목 컬럼 드롭 — 과목은 코스 파생이라 변경 불가(무결성). 다른 과목 표에 놓으면 시간만 이동.
    if (d.resType === "subject" && d.resId != null && subjectIdOf(Number(orig.courseId)) !== Number(d.resId))
      setMsg("과목은 변경할 수 없어 시간만 이동합니다");
    if (kst.date === orig.sessionDate && kst.startMin === startMinOf(orig) && newRoom === orig.roomId && newInstructor === orig.instructorId && !reassignStudent)
      return;
    requestChange(
      orig,
      {
        sessionDate: kst.date, startTime: fromMin(kst.startMin), durationMinutes: d.dur, roomId: newRoom,
        ...(newInstructor !== orig.instructorId ? { instructorId: newInstructor } : {}),
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

  // ── 기간 이동 ──
  const nav = (dir: number) => {
    if (view === "month") {
      const d = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + dir, 1));
      setAnchor(d.toISOString().slice(0, 10));
    } else if (period) {
      const len = dates.length;
      setPeriod({ from: addDaysISO(period.from, len * dir), to: addDaysISO(period.to, len * dir) });
    } else setAnchor(addDaysISO(anchor, (view === "day" ? 1 : 7) * dir));
  };
  const periodLabel =
    view === "month"
      ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
      : view === "day"
        ? anchor
        : `${dates[0]} ~ ${dates[dates.length - 1]}${period ? ` (기간 ${dates.length}일)` : ""}`;
  const isGrid = view === "week" || view === "day";
  // 현재 시각 인디케이터(빨간 선)용 — 오늘 컬럼에 표시
  const _now = new Date();
  const nowMin = _now.getHours() * 60 + _now.getMinutes();
  const nowTop = ((nowMin - GRID_MIN) / 60) * HOUR_H;
  const showNow = mounted && nowMin >= GRID_MIN && nowMin <= END_H * 60; // [TBO-21 B2] mount 후에만(하이드레이션 불일치 방지)

  // ── 우측 패널 데이터: 위=필터 결과 리스트(날짜 오름차순) · 아래=클릭 세션 상세(ScheduleRow DTO) ──
  const listRows = useMemo(() => sortByDateAsc(inRange), [inRange]);
  // 그룹 토글 차원: 학생 선택 시 학생별(스펙), 그 외 강의실 > 강사 순 폴백
  const listGroupDim: Exclude<ListGroupBy, "none"> = fStudents.size ? "student" : fRooms.size ? "room" : "instructor";
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
  const computeAxis = (cols: Col[], tzc?: CountryInfo | null): { startH: number; endH: number } => {
    // [KST 고정] kstFixed면 시차 반영 안 함(전 컬럼 KST 축) → 축이 08~22 + 콘텐츠 확장.
    const tzActive = !kstFixed && !!tzc && tzc.tz !== KST_TZ;
    const anyColTz = !kstFixed && !tzActive && cols.some((c) => c.tzc != null);
    const axisTz = tzActive || anyColTz;
    let contentLo = START_H * 60, contentHi = END_H * 60;
    if (!axisTz) {
      const colDates = new Set(cols.map((c) => c.date));
      for (const r of filtered) {
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

  const renderTimeGrid = (cols: Col[], tzc?: CountryInfo | null, paneModeSet?: Set<SessionModeFilter>, availW?: number, axisOverride?: { startH: number; endH: number }) => {
    // [KST 고정] kstFixed면 tz 위치 변환·편집 변환 없음(전 컬럼 KST). 국가정보는 칩 현지시각 라벨용으로만 유지.
    const tzActive = !kstFixed && !!tzc && tzc.tz !== KST_TZ;
    // 학생 개별 시차(피드백 2026-07-03 #1): 그리드 tz(전역/표별 — 명시 선택)가 없을 때만
    //  학생 컬럼의 country 파생 tz가 동작. 축은 컬럼 하나라도 tz면 0~24h(다른 나라 새벽 대비).
    const anyColTz = !kstFixed && !tzActive && cols.some((c) => c.tzc != null);
    // [스플릿 높이 정렬] 축은 공통(axisOverride) 우선 — 없으면 이 표 자체 축. 시차·심야 콘텐츠 확장은 computeAxis가 처리.
    const { startH, endH } = axisOverride ?? computeAxis(cols, tzc);
    const gridMin = startH * 60, gridMax = endH * 60, gridH = (endH - startH) * HOUR_H;
    const clampAxis = (mm: number) => clampToAxis(mm, gridMin, gridMax); // [이슈2] 이 그리드 축 경계
    // 변환 캐시(같은 filtered·tz면 재사용) — 표 2개/컬럼별 tz/리렌더에서 tz별 1회만 O(n) 변환(감사 M4)
    const cache = tzRowsCacheRef.current;
    if (cache.src !== filtered) { cache.src = filtered; cache.map.clear(); }
    const rowsForTz = (tz: string): ScheduleRow[] => {
      if (tz === KST_TZ) return filtered;
      const hit = cache.map.get(tz);
      if (hit) return hit;
      const shifted = shiftRowsToTz(filtered, tz);
      cache.map.set(tz, shifted);
      return shifted;
    };
    const isSplitGrid = cols[0]?.resType != null;
    // 데일리 스플릿(피드백 최종): **요일 열 폭은 주간과 동일(COL_MIN 고정)**, 그 안을 인원수로
    //  서브분할(같은 크기 요일 열을 늘리는 게 아님 — 컴팩트). 일수가 적으면 flex로 화면을 채움.
    const dayCount = isSplitGrid ? new Set(cols.map((c) => c.date)).size : cols.length;
    const perDay = isSplitGrid ? Math.max(1, Math.round(cols.length / Math.max(1, dayCount))) : 1;
    // [TBO-22 C1] 일별 컬럼은 넓은 화면에서는 컨테이너를 채우고, 좁은 화면에서만 최소폭 기반
    //  overflow를 허용한다. 이전 max colMinBase 캡은 주간 표 오른쪽에 빈 공간을 만들었다.
    const netW = Math.max(80, (availW ?? mainW) - GUTTER_W - 10);
    const fitDayW = Math.floor(netW / Math.max(1, dayCount));
    const dayW = Math.max(24 * perDay, colMinBase, fitDayW);
    const subW = isSplitGrid ? Math.max(24, Math.floor(dayW / perDay)) : Math.max(24, dayW);
    // 텍스트 밀도 단계(서브열 폭 기준) — 단일 함수 densityOf(lib/domain/lantiv, vitest)로 통일(R2)
    const textMode = densityOf(subW, isSplitGrid);
    const minCol = subW;
    const gutterTitle = kstFixed
      ? "모든 표가 KST 기준 00~24시 축으로 정렬됩니다. 해외 현지 시각은 수업 칩에 병기됩니다."
      : tzActive && tzc
        ? `${tzc.name} 현지 시각 축입니다.`
        : anyColTz
          ? "컬럼마다 현지 시각 축입니다."
          : "한국 표준시 축입니다.";
    return (
              <div className="card overflow-x-auto">
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
                          {i < endH - startH ? `${pad(startH + i)}:00` : ""}
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
                      // [오류2] 표별 수업방식 필터(빈 Set=전체) — 전역 fModes는 filtered 단계에서 이미 적용
                      const kindPass = (r: ScheduleRow) => !paneModeSet?.size || paneModeSet.has((r.mode ?? "in_person") as SessionModeFilter);
                      const colRows = rowsOfColumn(c, colTz ? rowsForTz(colTzc.tz) : filtered).filter(kindPass);
                      // [R-9] 전일 자정 크로스 세션의 익일 연속 블록(00:00~잔여) — **표시 전용**(상호작용은
                      //  시작일 원본 블록에서). KST 컬럼 전용 — 시차 컬럼은 shiftRowToTz가 현지 좌표로
                      //  통변환하므로(대개 크로스가 풀림) 기존 tzOverflowEnd 배지 규칙을 유지.
                      const contRows = !colTz
                        ? rowsOfColumn({ ...c, date: addDaysISO(c.date, -1) }, filtered).filter(kindPass).filter((r) => endMinOf(r) > 1440)
                        : [];
                      // [B-4 #9] 강사 본인 pending 요청 고스트(승인 대기 시각화) — KST 컬럼 전용·표시 전용
                      const colGhosts = !colTz && isInstructor
                        ? pendingGhosts.filter((g) => g.sessionDate === c.date && (c.resType == null || (c.resType === "instructor" && Number(c.resId) === Number(g.instructorId))))
                        : [];
                      // [오류5] 미리보기 = 자기 프레임 좌표 + 프레임 불변 델타 — 시차 컬럼에서도 그 나라 시간으로 표시
                      const sOf = (r: ScheduleRow) => (preview && preview.id === r.id ? startMinOf(r) + preview.dStart : startMinOf(r));
                      const eOf = (r: ScheduleRow) => (preview && preview.id === r.id ? endMinOf(r) + preview.dEnd : endMinOf(r));
                      const lanes = layoutLanes(colRows.map((r) => ({ id: r.id, start: sOf(r), end: eOf(r) })));
                      const bands = bandsOfColumn(c, gridMin, gridMax, colTz ? colTzc.tz : null); // [이슈1] 시차 컬럼도 변환해 표시
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
                                  {/* [피드백 #3] 학생 컬럼 시차 수동 변경 — 국기(현재 tz)/🌐(KST) 클릭 = 픽커 */}
                                  {!tzActive && c.resType === "student" && c.resId != null && (
                                    <button
                                      className="shrink-0 hover:opacity-70 text-caption leading-none px-0.5 py-0.5 -my-0.5"
                                      title={`${c.label} 컬럼 시차 변경(보기 전용 임시)`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); // [오류4] fixed 좌표
                                        setTzPickerFor((prev) => (prev?.colKey === c.key ? null : { colKey: c.key, studentId: c.resId!, x: b.left, y: b.bottom }));
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
                                        tzPickerFor.studentId in studentTzOverride
                                          ? (studentTzOverride[tzPickerFor.studentId]?.code ?? "KST")
                                          : "AUTO"
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setStudentTzOverride((prev) => {
                                          const n = { ...prev };
                                          if (v === "AUTO") delete n[tzPickerFor.studentId]; // 자동 = 학생 국가
                                          else n[tzPickerFor.studentId] = v === "KST" ? null : (countryByCode(v) ?? null);
                                          return n;
                                        });
                                        setTzPickerFor(null);
                                      }}
                                    >
                                      <option value="AUTO">자동 — 학생 국가 기준</option>
                                      <option value="KST">🇰🇷 한국 시간(KST) 고정</option>
                                      {COUNTRIES.filter((x) => x.code !== "KR").map((x) => (
                                        <option key={x.code} value={x.code}>{x.flag} {x.name}</option>
                                      ))}
                                    </select>
                                  </span>
                                )}
                              </>
                            ) : view === "week" ? (
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
                            ) : (
                              <span className="text-body font-semibold truncate px-1">{c.label}</span>
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
                            onClick={(e) => {
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
                              const gs = toMin(g.startTime);
                              // [R-9] 요청의 endTime<start = 익일 종료(자정 크로스) — 래핑해 높이 정상화
                              const ge = sessionEndMin({ startTime: g.startTime, endTime: g.endTime, durationMinutes: g.durationMinutes });
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
                                      {r.memo ? r.memo : view === "week" ? (r.roomName ?? "") : r.instructorName}
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

  // [스플릿 높이 정렬 2026-07-07] 스플릿(수동/자동 2표) 렌더 전에 모든 표의 축을 union → 공통 축으로 렌더.
  //  각 표가 제 콘텐츠·시차로 축을 따로 잡아 높이가 어긋나던 문제 해소(나란히 비교 가능). 시차 표는 0~24h로
  //  확장되어 union에 반영 = 시차까지 고려한 공통 눈금.
  const manualPanesAxis = manualPanes.length
    ? unionAxis([
        computeAxis(columns, country),
        ...manualPanes.map((mp) => computeAxis(colsFor(picksForManualPane(mp), `m${mp.uid}|`), paneCountryU[mp.uid] ?? null)),
      ])
    : undefined;
  const autoTzPanesAxis = autoTzStudentPanes.length
    ? unionAxis([
        ...(instPicks.length ? [computeAxis(colsFor(instPicks, "tzinst|"), paneTzOf("instructor"))] : []),
        ...autoTzStudentPanes.map((p) => computeAxis(colsFor([p.pick], `tzs${p.pick.id}|`), p.country)),
      ])
    : undefined;
  const twoPanesAxis = twoPanes
    ? unionAxis(panes.map((g) => computeAxis(colsFor(g.picks, `p${g.dim}|`, paneDatesOf(g.dim)), paneTzOf(g.dim))))
    : undefined;

  return (
    <div className="p-6 max-w-page-wide mx-auto">
      {/* [DESIGN §5.5] 조작 설명서는 부제에서 제거 → ⓘ 팝오버. 부제는 상태 정보만. */}
      <PageHeader
        title="스케줄 캘린더"
        sub={
          <>
            {periodLabel}
            <span className="text-fg-subtle">
              {" "}· {inRange.length}건{anyFilter ? ` / 전체 ${rows.length}` : ""} · 시수 {hrs.hours}h
            </span>
            {selected && <span className="text-accent"> · {selected.name} 개인 스케줄</span>}
            {isSplit && (
              <span className="text-accent">
                {" "}· {twoPanes
                  ? `표 2개(강사 ${panes[0].picks.length} | 학생 ${panes[1].picks.length})`
                  : `데일리 스플릿(${splitDim === "instructor" ? "강사" : splitDim === "student" ? "학생" : "강의실"} ${singleSplitPicks.length})`}
              </span>
            )}
          </>
        }
        actions={
          <>
            <div className="flex rounded-md overflow-hidden border">
              {(["month", "week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  className={`btn btn-sm rounded-none border-0 ${view === v ? "badge-accent" : ""}`}
                  onClick={() => setView(v)}
                >
                  {v === "month" ? "월간" : v === "week" ? "주간" : "일간(강의실)"}
                </button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={() => nav(-1)}>◀</button>
            <button className="btn btn-sm" onClick={() => setAnchor(todayISO())}>오늘</button>
            <button className="btn btn-sm" onClick={() => nav(1)}>▶</button>
            {view === "day" && (
              <input type="date" className="input h-7 w-36" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            )}
            {/* 표 분할은 필터 선택에서 자동(강사+학생 동시 선택 → 표 2개) — 수동 버튼 제거(피드백) */}
            {canAdd && resources && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setCreating({ date: view === "day" ? anchor : (dates.find((d) => d === todayISO()) ?? dates[0]) })}
              >
                + 스케줄 추가{isInstructor ? " (내 수업)" : ""}
              </button>
            )}
            {/* 국가 시차 뷰(전역): 선택 시 그 국가 학생 세션 필터 + 그리드가 그 나라 시간으로 — PNG로 그대로 추출 */}
            <CountryInput value={country} onSelect={setCountry} />
            {/* [KST 고정 축] 여러 시차를 나란히 비교할 때 — 모든 컬럼을 KST 위치로(같은 가로선=같은 순간). 해외 칩엔 현지시각 병기 */}
            <button
              className={`btn btn-sm ${kstFixed ? "badge-accent" : ""}`}
              onClick={() => setKstFixed((v) => !v)}
              title="KST 고정 축 — 모든 컬럼을 한국시간 위치로 그려 시차 간 '같은 순간'을 세로로 정렬(해외 컬럼은 칩에 현지시각 병기). 끄면 컬럼별 현지시각 표시."
            >
              🇰🇷 KST 고정{kstFixed ? " ✓" : ""}
            </button>
            {anyTzActive && (
              <span
                className="badge text-caption"
                title={kstFixed ? "표 행은 KST 기준으로 맞추고, 각 수업 칩에 현지 시각을 병기합니다." : "시차 표는 현지 시간 축으로 표시됩니다."}
              >
                시차 적용 중 · {kstFixed ? "행 정렬 KST" : "현지 축"}
              </span>
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
              <p>강사+학생 동시 선택 = 표 2개(스플릿)</p>
              <p>표 사이 드래그 = 이동/재배정(강사·1:1 학생)</p>
              <p>시차 컬럼도 편집 가능 — 저장은 KST 자동 변환</p>
              <p>가용 밴드: 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제</p>
              <p>우측 리스트 유저 클릭 = 개인 스케줄 필터</p>
            </HelpPopover>
          </>
        }
      />

      <div className="flex gap-4 items-start">
        {/* 좌측 추천 패널 제거(피드백 2026-07-02 #5) — 스플릿뷰로 강사·학생 스케줄을 직접 비교·배치. */}
        {/* 본문 */}
        <div ref={mainRef} className="flex-1 min-w-0 space-y-4">
          {/* ── Lantiv형 필터 바: 리소스 다중선택(스플릿) + 상태/그룹/기간 + 검색/색 기준.
                 [압축 2026-07-06] 뷰 도구(열 좁게·뷰 프리셋)를 별도 행 대신 필터 카드 2행에 통합 — 세로 1행 절약 ── */}
          <CalendarFilterBar
            tools={
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${compactCols ? "badge-accent" : ""}`}
                  title="하루 열 상한 축소(128→80px) — 컬럼은 항상 컨테이너에 맞는 고정폭(스크롤 없음)"
                  onClick={() => setCompactCols((v) => !v)}
                >⇤ 열 좁게</button>
                <CalendarViewTabs
                  activeId={activePresetId}
                  onApply={applyPreset}
                  onSaveCurrent={saveCurrentPreset}
                  onMsg={setMsg}
                />
                <span className="w-px h-5 bg-line" />
                {/* [#2 2026-07-06] 수동 표 빌더 — 강사·학생·강의실·과목 임의 조합(동일차원 2표 허용) */}
                <button
                  type="button"
                  className={`btn btn-sm ${manualPanes.length ? "badge-accent" : ""}`}
                  title="원하는 기준(강사·학생·강의실·과목)으로 표를 나눠 나란히 보기 — 표를 여러 개 추가 가능(학생×학생 등)"
                  onClick={addManualPane}
                  disabled={view === "month"}
                >⊞ 표 나누기{manualPanes.length ? ` (${manualPanes.length})` : ""}</button>
                <span className="w-px h-5 bg-line" />
              </>
            }
            resources={resources}
            rooms={rooms}
            q={q}
            onQ={setQ}
            colorBy={colorBy}
            onColorBy={setColorBy}
            fInstructors={fInstructors}
            fStudents={fStudents}
            fRooms={fRooms}
            onToggleId={(dim, id) => {
              const setter = dim === "instructor" ? setFInstructors : dim === "student" ? setFStudents : setFRooms;
              setter((prev) => {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              });
            }}
            onClearDim={(dim) =>
              (dim === "instructor" ? setFInstructors : dim === "student" ? setFStudents : setFRooms)(new Set())
            }
            subjectOptions={[
              ...[...new Set((resources?.courses ?? []).map((cs) => cs.subjectName).filter(Boolean))].sort(),
              // [오류2] 종류(진단고사/상담)를 과목 카테고리의 유사 옵션으로 편입 — 합집합 매칭(matchesSubjectFilter)
              ...SUBJECT_KIND_OPTIONS.map((o) => o.value),
            ]}
            fSubjects={fSubjects}
            onToggleSubject={(s) => setFSubjects((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
            onClearSubjects={() => setFSubjects(new Set())}
            fStatuses={fStatuses}
            onToggleStatus={(s) =>
              setFStatuses((prev) => {
                const n = new Set(prev);
                if (n.has(s)) n.delete(s);
                else n.add(s);
                return n;
              })
            }
            fModes={fModes}
            onToggleMode={(k) =>
              setFModes((prev) => {
                const n = new Set(prev);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            groupOnly={groupOnly}
            onGroupOnly={setGroupOnly}
            period={period}
            onPeriod={(p) => { if (p) setPickedDates([]); /* [배타] 기간 설정 시 체리픽 해제 */ setPeriod(p); }}
            pickedDates={pickedDates}
            onPickDate={(d) => { setPeriod(null); /* [배타 2026-07-06] 체리픽 전환 시 기간 초기화(대표 지적 4) */ setPickedDates((prev) => (prev.includes(d) || prev.length >= 14 ? prev : [...prev, d].sort())); }}
            onUnpickDate={(d) => setPickedDates((prev) => prev.filter((x) => x !== d))}
            onClearPicked={() => setPickedDates([])}
            anyFilter={!!anyFilter}
            onClearAll={clearFilters}
          />
          {selected && selBlocks.length > 0 && (
            <p className="text-caption text-fg-subtle inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(26,127,55,.18)", borderLeft: "2px solid var(--color-success)" }} /> 가용
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, rgba(110,118,129,.18) 0 3px, rgba(110,118,129,.3) 3px 6px)" }} /> 불가
              </span>
              {/* 조작법(클릭·드래그·삭제)은 헤더 ⓘ 팝오버로 이동(DESIGN §5.5) */}
            </p>
          )}

          {msg && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-body text-white flex items-center gap-2"
              style={{ background: /(실패|없습니다|수 없|연결할 수|올바)/.test(msg) ? "var(--color-danger)" : "var(--color-success)" }}
              role="status"
            >
              <span>{msg}</span>
              <button onClick={() => setMsg("")} className="opacity-80 hover:opacity-100" aria-label="닫기">✕</button>
            </div>
          )}

          <div ref={captureRef} className="bg-canvas">
            {view === "month" ? (
              <MonthGrid
                anchor={anchor}
                rows={filtered}
                colorOf={colorOf}
                onPick={(r) => openEditor(r)}
                onPickDay={(d) => {
                  setAnchor(d);
                  setView("day");
                }}
                onCreateDay={(d) => canAdd && setCreating({ date: d })}
              />
            ) : autoTzStudentPanes.length > 0 ? (
              /* [TBO-22 C1] 다중 시차 학생 비교 — 날짜 안 서브컬럼 대신 학생별 표를 우측으로 분리.
                 모든 표는 00-24 KST 공통 축을 쓰고, 해외 표는 칩에 현지시각을 병기한다. */
              <div className="flex gap-3 items-start pb-1 overflow-x-auto">
                {instPicks.length > 0 && (
                  <div className="shrink-0" style={{ width: Math.max(360, (mainW - 16) / (autoTzStudentPanes.length + 1)) }}>
                    <CalendarSplitPane
                      pane={{ uid: 900001, dim: "instructor", ids: instPicks.map((x) => x.id) }}
                      fixedDim
                      resources={resources}
                      rooms={rooms}
                      onChange={(patch) => { if (patch.ids) setFInstructors(new Set(patch.ids)); }}
                      onRemove={() => setClosedPanes((prev) => new Set(prev).add("instructor"))}
                      headerExtra={<CountryInput compact value={paneTzOf("instructor")} onSelect={(c) => setPaneCountry((prev) => ({ ...prev, instructor: c }))} placeholder="🌐 국가" />}
                    >
                      {renderTimeGrid(colsFor(instPicks, "tzinst|"), paneTzOf("instructor"), paneModes.instructor, Math.max(360, (mainW - 16) / (autoTzStudentPanes.length + 1)), autoTzPanesAxis)}
                    </CalendarSplitPane>
                  </div>
                )}
                {autoTzStudentPanes.map(({ pick, country: studentCountry }) => {
                  const w = Math.max(360, (mainW - 16) / (autoTzStudentPanes.length + (instPicks.length ? 1 : 0)));
                  return (
                    <div key={pick.id} className="shrink-0" style={{ width: w }}>
                      <CalendarSplitPane
                        pane={{ uid: 910000 + pick.id, dim: "student", ids: [pick.id] }}
                        fixedDim
                        resources={resources}
                        rooms={rooms}
                        onChange={(patch) => { if (patch.ids) setFStudents(new Set(patch.ids)); }}
                        onRemove={() => setFStudents((prev) => { const n = new Set(prev); n.delete(pick.id); return n; })}
                        headerExtra={
                          <CountryInput compact value={studentCountry} onSelect={(c) => setStudentTzOverride((prev) => ({ ...prev, [pick.id]: c }))} placeholder="🌐 국가" />
                        }
                      >
                        {renderTimeGrid(colsFor([pick], `tzs${pick.id}|`), studentCountry, paneModes.student, w, autoTzPanesAxis)}
                      </CalendarSplitPane>
                    </div>
                  );
                })}
              </div>
            ) : manualPanes.length > 0 ? (
              /* [#2 2026-07-06] 수동 표 빌더 — 임의 차원(강사·학생·강의실·과목) 조합·동일차원 2표 허용.
                 [TBO-22 C1] 기존 기본 뷰를 왼쪽에 유지하고, 수동 표를 우측에 추가한다. */
              <div className="flex gap-3 items-start pb-1 overflow-x-auto">
                {(() => {
                  const w = Math.max(360, (mainW - 16) / (manualPanes.length + 1));
                  return (
                    <div className="shrink-0" style={{ width: w }}>
                      <div className="flex items-center gap-1.5 mb-1 px-0.5">
                        <span className="text-caption font-semibold text-fg-muted px-1">기본 뷰</span>
                        <span className="text-caption text-fg-muted truncate flex-1">현재 필터와 기간 유지</span>
                      </div>
                      {renderTimeGrid(columns, country, undefined, w, manualPanesAxis)}
                    </div>
                  );
                })()}
                {manualPanes.map((mp) => {
                  const picks = picksForManualPane(mp);
                  const w = Math.max(360, (mainW - 16) / (manualPanes.length + 1));
                  return (
                    <div key={mp.uid} className="shrink-0" style={{ width: w }}>
                      <CalendarSplitPane
                        pane={{ uid: mp.uid, dim: mp.dim, ids: mp.ids }}
                        resources={resources}
                        rooms={rooms}
                        subjects={subjectOpts}
                        onChange={(patch) => setManualPanes((prev) => prev.map((x) => (x.uid === mp.uid ? { ...x, ...patch } : x)))}
                        onRemove={() => {
                          setManualPanes((prev) => prev.filter((x) => x.uid !== mp.uid));
                          setPaneCountryU((prev) => { const n = { ...prev }; delete n[mp.uid]; return n; });
                          setPaneModesU((prev) => { const n = { ...prev }; delete n[mp.uid]; return n; });
                        }}
                        onMoveLeft={() => moveManualPane(mp.uid, -1)}
                        onMoveRight={() => moveManualPane(mp.uid, 1)}
                        headerExtra={
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <OptionPick icon="🖥️" label="수업방식" title="이 표에만 적용 (복수=합집합·빈 선택=전체)"
                              options={MODE_FILTERS.map((k) => ({ value: k, label: MODE_FILTER_LABEL[k] }))}
                              picked={(paneModesU[mp.uid] ?? new Set()) as unknown as Set<string>}
                              onToggle={(v) => setPaneModesU((prev) => { const k = v as SessionModeFilter; const cur = new Set(prev[mp.uid] ?? []); if (cur.has(k)) cur.delete(k); else cur.add(k); const n = { ...prev }; if (cur.size) n[mp.uid] = cur; else delete n[mp.uid]; return n; })}
                              onClear={() => setPaneModesU((prev) => { const n = { ...prev }; delete n[mp.uid]; return n; })} />
                            <CountryInput compact value={paneCountryU[mp.uid] ?? null} onSelect={(c) => setPaneCountryU((prev) => ({ ...prev, [mp.uid]: c }))} placeholder="🌐 국가" />
                          </div>
                        }
                      >
                        {renderTimeGrid(colsFor(picks, `m${mp.uid}|`), paneCountryU[mp.uid] ?? null, paneModesU[mp.uid], w, manualPanesAxis)}
                      </CalendarSplitPane>
                    </div>
                  );
                })}
              </div>
            ) : twoPanes ? (
              /* 강사+학생 동시 필터 → 표 2개 자동(각 표 = 날짜×선택 데일리 스플릿). ✕=표 닫기(필터 유지) */
              <div className="flex gap-3 items-start pb-1">{/* [정렬 2026-07-06] 표 자체가 고정폭 fit — wrapper 스크롤 불필요 */}
                {panes.map((g) => (
                  <CalendarSplitPane
                    key={g.dim}
                    pane={{ uid: g.dim === "instructor" ? 1 : 2, dim: g.dim, ids: g.picks.map((x) => x.id) }}
                    fixedDim
                    resources={resources}
                    rooms={rooms}
                    onChange={(patch) => {
                      if (!patch.ids) return;
                      const setter = g.dim === "instructor" ? setFInstructors : setFStudents;
                      setter(new Set(patch.ids)); // 표의 픽커 = 상단 필터와 단일 상태(양방향 동기화)
                    }}
                    onRemove={() => {
                      setClosedPanes((prev) => new Set(prev).add(g.dim));
                      // [감사 M8] 닫힌 표의 국가 override 정리 — 다시 열면 전역 국가를 따름
                      setPaneCountry((prev) => { const n = { ...prev }; delete n[g.dim]; return n; });
                    }}
                    headerExtra={
                      /* [통일 2026-07-06] 표별 필터바 = 본 필터바와 같은 문법·규격
                         (input h-7 text-caption w-[120px] · 종류=OptionPick 팝오버 · 배지 text-micro) */
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* [이슈3] 이 표의 날짜 범위 — 캘린더(from~to)로 표마다 다르게. 비우면 전역 기간. */}
                        <input type="date" className="input h-7 px-1.5 text-caption w-[120px]" title="이 표 시작일"
                          value={paneRange[g.dim]?.from ?? (dates[0] ?? "")}
                          onChange={(e) => setPaneRange((prev) => ({ ...prev, [g.dim]: { from: e.target.value, to: prev[g.dim]?.to ?? e.target.value } }))} />
                        <span className="text-caption text-fg-subtle">~</span>
                        <input type="date" className="input h-7 px-1.5 text-caption w-[120px]" title="이 표 종료일"
                          value={paneRange[g.dim]?.to ?? (dates[dates.length - 1] ?? "")}
                          min={paneRange[g.dim]?.from ?? dates[0]}
                          onChange={(e) => setPaneRange((prev) => ({ ...prev, [g.dim]: { from: prev[g.dim]?.from ?? (dates[0] ?? e.target.value), to: e.target.value } }))} />
                        {(paneRange[g.dim] || panePicked[g.dim]?.length) && (
                          <button type="button" className="btn btn-sm h-7 px-1.5" title="전역 기간으로(범위·선택 날짜 해제)"
                            onClick={() => { setPaneRange((prev) => { const n = { ...prev }; delete n[g.dim]; return n; }); setPanePicked((prev) => { const n = { ...prev }; delete n[g.dim]; return n; }); }}>↺</button>
                        )}
                        {/* [B-3 #5] cherry-pick: 원하는 날짜만 여러 개 — 선택 시 범위(from~to)보다 우선 */}
                        <input type="date" className="input h-7 px-1.5 text-caption w-[120px]" title="날짜 추가(cherry-pick) — 고르면 그 날짜들만 표시"
                          value=""
                          onChange={(e) => { const d = e.target.value; if (!d) return; setPaneRange((prev) => { const n = { ...prev }; delete n[g.dim]; return n; }); /* [배타] */ setPanePicked((prev) => { const cur = prev[g.dim] ?? []; if (cur.includes(d) || cur.length >= 14) return prev; return { ...prev, [g.dim]: [...cur, d].sort() }; }); }} />
                        {(panePicked[g.dim] ?? []).map((d) => (
                          <span key={d} className="badge text-micro mono cursor-pointer" title="클릭=이 날짜 제거"
                            onClick={() => setPanePicked((prev) => { const cur = (prev[g.dim] ?? []).filter((x) => x !== d); const n = { ...prev }; if (cur.length) n[g.dim] = cur; else delete n[g.dim]; return n; })}>
                            {d.slice(5)} ✕
                          </span>
                        ))}
                        <span className="w-px h-5 bg-line" />
                        {/* [오류2] 표별 수업방식(대면/비대면) 필터 — 이 표에만 적용. 본 필터바와 같은 팝오버 문법(OptionPick) */}
                        <OptionPick icon="🖥️" label="수업방식" title="이 표에만 적용 (복수=합집합·빈 선택=전체)"
                          options={MODE_FILTERS.map((k) => ({ value: k, label: MODE_FILTER_LABEL[k] }))}
                          picked={(paneModes[g.dim] ?? new Set()) as unknown as Set<string>}
                          onToggle={(v) => setPaneModes((prev) => { const k = v as SessionModeFilter; const cur = new Set(prev[g.dim] ?? []); if (cur.has(k)) cur.delete(k); else cur.add(k); const n = { ...prev }; if (cur.size) n[g.dim] = cur; else delete n[g.dim]; return n; })}
                          onClear={() => setPaneModes((prev) => { const n = { ...prev }; delete n[g.dim]; return n; })} />
                        <CountryInput
                          compact
                          value={paneTzOf(g.dim)}
                          onSelect={(c) => setPaneCountry((prev) => ({ ...prev, [g.dim]: c }))}
                          placeholder="🌐 국가"
                        />
                      </div>
                    }
                  >
                    {renderTimeGrid(colsFor(g.picks, `p${g.dim}|`, paneDatesOf(g.dim)), paneTzOf(g.dim), paneModes[g.dim], panes.length >= 2 ? Math.max(320, (mainW - 16) / panes.length) : mainW, twoPanesAxis)}
                  </CalendarSplitPane>
                ))}
              </div>
            ) : (
              renderTimeGrid(columns, country)
            )}
          </div>
          {isGrid && selected?.type === "instructor" && (
            <p className="text-caption text-fg-subtle">
              개인 스케줄: {selected.name} · {inRange.length}개 수업 · 시수 {hrs.hours}h
            </p>
          )}
        </div>

        {/* 우측 컬럼(Lantiv): 유저별 스케줄(단일 선택) + 수업 리스트(날짜순·그룹 토글) + 선택 수업 상세(DTO) */}
        <div className="w-64 shrink-0 space-y-3 self-start sticky top-4">
          {/* [피드백 2026-07-03] 우측 리스트 유저 클릭 = 그 유저 스케줄로 뷰 필터(A안 조정 번복).
              selectResource가 해당 차원 필터(fStudents 등)를 그 1명으로 세팅 → 상단 체크박스와 자동 동기화.
              카드도 함께 표시(setInfoTarget). 재클릭/해제(null)면 필터·카드 모두 해제. */}
          {resources && (
            <ResourcePanel
              resources={resources}
              selected={cardTarget}
              onSelect={(r) => { selectResource(r); setInfoTarget(r); }}
              filterIds={{ instructor: fInstructors, student: fStudents, room: fRooms }}
              onToggleFilter={(dim, id) => {
                // 필터바 onToggleId와 동일 로직(단일 소스) — 리스트 클릭 = 필터 선택/해제(UX 제안 2026-07-06)
                const setter = dim === "instructor" ? setFInstructors : dim === "student" ? setFStudents : setFRooms;
                setter((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
              }}
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
              isFiltered={selected != null && selected.type === cardTarget.type && Number(selected.id) === Number(cardTarget.id)}
              onFocusView={() => selectResource(cardTarget)}
              onClearFocus={() => { selectResource(null); setInfoTarget(cardTarget); }}
              onMsg={setMsg}
              onSaved={load}
              onAddSchedule={
                canAdd
                  ? () =>
                      setCreating({
                        // 기준일: 전역 추가 버튼과 동일 규칙(오늘이 뷰에 있으면 오늘, 아니면 첫 날)
                        date: view === "day" ? anchor : (dates.find((d) => d === todayISO()) ?? dates[0]),
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
                : `${effRange.from === effRange.to ? effRange.from : `${effRange.from}~${effRange.to}`} 기간${selected ? ` · ${selected.name} 개인 필터` : ""} 기준 — 기간을 넓히거나 필터를 확인하세요`
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
              if (r.sessionDate < range.from || r.sessionDate > range.to) setAnchor(r.sessionDate);
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
            onOpenModal={(r) => openEditor(r)}
          />
          </div>
        </div>
      </div>

      {editing && (
        <DetailModal
          row={editing}
          rooms={rooms}
          instructors={(resources?.instructors ?? []).map((i) => ({ id: Number(i.id), name: i.name }))}
          colorOf={colorOf}
          ownerTz={editingTz}
          onClose={() => { setEditing(null); setEditingTz(null); }}
          onDelete={() => deleteSession(editing.id)}
          onSave={async (patch) => {
            const id = editing.id;
            // [이슈1] 비KST 편집: 폼에 입력한 현지 시각(sessionDate/start/end)을 KST 저장값으로 역변환.
            //  [R-9] 종료가 KST에서 다음날로 넘어가면(end<start) 백엔드가 **익일 종료**로 해석해
            //  durationMinutes로 저장한다(자정 크로스 정식 지원 — 구 400 거부 폐지).
            const kst = editingTz ? kstPatchTimes(patch, editingTz.tz) : patch;
            setEditing(null); setEditingTz(null);
            await applyPatch(id, kst);
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

      {creating && resources && (
        <CreateModal
          resources={resources}
          rooms={rooms}
          requestMode={isInstructor} // [UX H1] 강사=수업 탭 제출이 승인 요청
          defaultDate={creating.date}
          defaultStart={creating.start}
          lockInstructorId={isInstructor ? myInstructorId : undefined}
          defaultInstructorId={creating.defaultInstructorId}
          defaultOwner={creating.owner ?? selected}
          ownerTz={creating.tz ?? undefined}
          onClose={() => setCreating(null)}
          onCreate={createSession}
          onCreateSeries={createSeries}
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
          onSubmit={() => submitAvailabilityApproval(availabilityApproval)}
        />
      )}
    </div>
  );
}

function AvailabilityApprovalModal({
  draft, rows, onClose, onSubmit,
}: {
  draft: AvailabilityApprovalDraft;
  rows: ScheduleRow[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  const impacted = draft.impacted.map((x) => {
    const row = rows.find((r) => r.id === x.sessionId);
    return {
      id: x.sessionId,
      title: row ? `${row.courseName} · ${row.instructorName}` : `수업 #${x.sessionId}`,
      time: `${x.sessionDate} ${x.startTime ?? row?.startTime ?? ""}${x.endTime ?? row?.endTime ? `~${x.endTime ?? row?.endTime}` : ""}`,
    };
  });
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div className="card card-pad w-[480px] max-w-[95vw] max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">승인 요청 필요</div>
        <div className="space-y-2 min-h-0 overflow-y-auto">
          <p className="text-body text-fg-muted">
            {draft.summary} 변경은 이미 잡힌 수업에 영향을 줍니다. 승인센터로 요청을 보냅니다.
          </p>
          <div className="rounded-md border overflow-hidden">
            <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">영향 수업 {impacted.length}건</div>
            <div className="divide-y max-h-48 overflow-y-auto">
              {impacted.map((x) => (
                <div key={x.id} className="px-3 py-2">
                  <div className="text-body font-medium">{x.title}</div>
                  <div className="text-caption text-fg-muted mono">{x.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 shrink-0">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" onClick={onSubmit}>승인 요청 보내기</button>
        </div>
      </div>
    </div>
  );
}

// ── 불가/가용 블록 수정 모달(더블클릭) ──
function BlockEditModal({
  block, onClose, onSave, onDelete,
}: {
  block: AvailabilityBlock;
  onClose: () => void;
  onSave: (body: AvailabilityUpsertBody) => void;
  onDelete: () => void;
}) {
  const [kind, setKind] = useState<AvailabilityBlock["kind"] | "online_only">(block.kind);
  const [weekday, setWeekday] = useState<number>(block.weekday);
  const [start, setStart] = useState(block.startTime);
  const [end, setEnd] = useState(block.endTime);
  const [from, setFrom] = useState(block.effectiveFrom ?? "");
  const [to, setTo] = useState(block.effectiveTo ?? "");
  const periodOk = !from || !to || from <= to;
  const valid = start < end && periodOk;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div className="card card-pad w-[380px] max-w-[95vw] max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{AVAILABILITY_KIND_LABEL[kind]} 수정</div>
        <Field label="종류">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="unavailable">불가(차단)</option>
            <option value="available">가용</option>
            <option value="online_only">온라인만 가능</option>
          </select>
        </Field>
        <Field label="요일">
          <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WD.map((w, d) => <option key={d} value={d}>{w}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작"><input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="종료"><input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="기간 시작 (선택)"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="기간 종료 (선택)"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <p className="text-caption text-fg-muted">매주 {WD[weekday]}요일 반복. 기간을 비우면 무기한, 지정하면 그 기간에만 적용.</p>
        {!periodOk && <p className="text-caption text-danger">기간 시작이 종료보다 늦을 수 없습니다.</p>}
        <div className="flex justify-between gap-2 pt-1">
          <button className="btn btn-sm text-danger" onClick={onDelete}>삭제</button>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={!valid}
              onClick={() => onSave({ id: block.id, ownerType: block.ownerType, ownerId: block.ownerId, kind, weekday, startTime: start, endTime: end, effectiveFrom: from || undefined, effectiveTo: to || undefined })}>
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── 월간 그리드 ──
function MonthGrid({
  anchor,
  rows,
  colorOf,
  onPick,
  onPickDay,
  onCreateDay,
}: {
  anchor: string;
  rows: ScheduleRow[];
  colorOf: (r: ScheduleRow) => string;
  onPick: (r: ScheduleRow) => void;
  onPickDay: (date: string) => void;
  onCreateDay: (date: string) => void;
}) {
  const ym = anchor.slice(0, 7);
  const firstWd = weekdayOf(`${ym}-01`);
  const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(firstWd).fill(null),
    ...Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`),
  ];
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    rows.forEach((r) => {
      const a = m.get(r.sessionDate) ?? [];
      a.push(r);
      m.set(r.sessionDate, a);
    });
    m.forEach((a) => a.sort((x, y) => (x.startTime ?? "").localeCompare(y.startTime ?? "")));
    return m;
  }, [rows]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b">
        {WD.map((w, i) => (
          <div
            key={w}
            className={`px-3 py-2 text-caption font-semibold ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-fg-muted"}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => (
          <div
            key={idx}
            className={`min-h-[104px] border-b border-r p-1.5 ${date ? "cursor-pointer" : ""}`}
            style={{ borderColor: "var(--color-line-muted)" }}
            onDoubleClick={(e) => { if (date && (e.target as HTMLElement).closest("[data-evt]") == null) onCreateDay(date); }}
            title={date ? "더블클릭으로 일정 추가" : undefined}
          >
            {date && (
              <button
                className={`text-caption mb-1 px-1 rounded hover:bg-canvas-subtle ${date === todayISO() ? "font-bold text-accent" : "text-fg-subtle"}`}
                onClick={() => onPickDay(date)}
                title="일간 보기"
              >
                {Number(date.slice(8))}
              </button>
            )}
            <div className="space-y-1">
              {(date ? (byDay.get(date) ?? []) : []).slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  data-evt
                  onClick={() => onPick(r)}
                  onDoubleClick={(e) => { e.stopPropagation(); onPick(r); }}
                  className="block w-full text-left rounded px-1.5 py-0.5 text-micro text-white truncate"
                  style={{ background: colorOf(r) }}
                  title={`${r.startTime ?? ""}–${r.endTime ?? ""} ${r.courseName} · ${r.instructorName}`}
                >
                  <span className="mono">
                    {r.startTime ?? ""}–{r.endTime ?? ""}
                  </span>{" "}
                  {r.courseName}
                </button>
              ))}
              {date && (byDay.get(date)?.length ?? 0) > 4 && (
                <button className="text-micro text-fg-muted hover:underline px-1" onClick={() => onPickDay(date)}>
                  +{(byDay.get(date)?.length ?? 0) - 4} 더보기
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 상세 + 편집 모달 — 편집 폼은 SessionEditFields 공통(우측 패널과 동일 폼·검증·패치 빌드) ──
function DetailModal({
  row,
  rooms,
  instructors,
  colorOf,
  ownerTz,
  onClose,
  onSave,
  onDelete,
}: {
  row: ScheduleRow;
  rooms: Room[];
  instructors: { id: number; name: string }[];
  colorOf: (r: ScheduleRow) => string;
  ownerTz?: CountryInfo | null; // [이슈1] 비KST 편집이면 이 tz(현지 시각 입력 → 저장 시 KST 변환)
  onClose: () => void;
  onSave: (patch: SchedulePatchBody) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const isSeries = row.seriesId != null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div className="card card-pad w-[440px] max-w-[95vw] max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <span className="inline-block w-3 h-3 rounded-sm mt-1.5 shrink-0" style={{ background: colorOf(row) }} />
          <div className="flex-1">
            <div className="font-semibold">{row.courseName}</div>
            <div className="text-fg-subtle text-caption">
              {row.subjectName} · {row.instructorName}
              {row.studentNames?.length ? ` · ${row.studentNames.join(", ")}` : ""}
            </div>
          </div>
          {isSeries && <span className="badge badge-accent">반복</span>}
        </div>

        {mode === "detail" ? (
          <>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1.5 text-body">
              <Dt>날짜</Dt>
              <dd>
                {row.sessionDate} ({WD[weekdayOf(row.sessionDate)]})
              </dd>
              <Dt>시간</Dt>
              <dd className="mono">
                {row.startTime ?? "-"} – {row.endTime ?? "-"} ({row.durationMinutes}분)
              </dd>
              <Dt>강의실</Dt>
              <dd>{row.roomName ?? "미지정"}</dd>
              <Dt>학생</Dt>
              <dd>{row.studentNames?.length ? row.studentNames.join(", ") : "—"}</dd>
              <Dt>상태</Dt>
              <dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
              {row.topic && (
                <>
                  <Dt>주제</Dt>
                  <dd>{row.topic}</dd>
                </>
              )}
              <Dt>메모</Dt>
              <dd className="whitespace-pre-wrap">{row.memo ? row.memo : <span className="text-fg-subtle">—</span>}</dd>
            </dl>
            <div className="flex justify-between gap-2 pt-1">
              <Link href={`/sessions/${row.id}`} className="btn btn-sm">
                강의 상세 페이지 →
              </Link>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={onClose}>
                  닫기
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setMode("edit")}>
                  편집
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {ownerTz && ownerTz.tz !== KST_TZ && (
              <p className="text-caption px-1 text-accent">
                🌐 {ownerTz.name} 현지 시각으로 입력하세요 — 저장 시 한국 시간(KST)으로 변환됩니다.
              </p>
            )}
            <SessionEditFields
              row={row}
              rooms={rooms}
              instructors={instructors}
              onSave={(patch) => onSave(patch)}
              onCancel={() => setMode("detail")}
              onDelete={onDelete}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── 반복 일정 변경 범위 묻기(드래그·리사이즈 후) ──
function RecurrencePrompt({
  label,
  onPick,
  onCancel,
}: {
  label: string;
  onPick: (scope: "this" | "this_and_following" | "all") => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35" onClick={onCancel}>
      <div className="card card-pad w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">반복 일정 수정</div>
        <p className="text-body text-fg-muted">{label} — 어디까지 적용할까요?</p>
        <div className="grid gap-2">
          <button className="btn" onClick={() => onPick("this")}>
            이 일정만
          </button>
          <button className="btn" onClick={() => onPick("this_and_following")}>
            이 일정 및 이후 전부
          </button>
          <button className="btn" onClick={() => onPick("all")}>
            시리즈 전체
          </button>
        </div>
        <div className="flex justify-end pt-1">
          <button className="btn btn-sm" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CreateModal 공용 폼 조각(수업·가용·불가 3탭 재사용 — 이슈3) ──
const DUR_PRESETS = [30, 60, 90, 120, 150, 180] as const;
const durLabel = (m: number) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? "30분" : ""}`);

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Field label="날짜"><input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

// [이슈1] 검색 가능한 다중 선택 리스트 — 인원이 많아도 검색으로 좁혀 선택(체크박스 나열 대체).
function SearchableCheckList({ items, selected, onToggle, placeholder }: {
  items: { id: number; name: string }[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const filtered = n ? items.filter((it) => it.name.toLowerCase().includes(n)) : items;
  return (
    <div className="border rounded-md overflow-hidden">
      <input className="input h-8 w-full text-caption rounded-none border-0 border-b"
        placeholder={placeholder ?? "검색"} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[168px] overflow-y-auto p-1 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-caption text-fg-subtle text-center py-3">검색 결과 없음</p>
        ) : filtered.map((it) => {
          const on = selected.has(it.id);
          return (
            <label key={it.id} className={`flex items-center gap-2 px-2 h-7 rounded cursor-pointer text-caption ${on ? "badge-accent" : "hover:bg-canvas-subtle"}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(it.id)} />
              <span className="flex-1 truncate">{it.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// 시작·종료 시각 + [이슈2] 토글형 빠른 진행시간(시작 기준 종료 자동) — 수업/가용/불가 공통.
function TimeRangeField({ start, end, onStart, onEnd, endHint }: {
  start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void; endHint?: string;
}) {
  const dur = (toMin(end) - toMin(start) + 1440) % 1440; // [R-9] end<start=익일 종료 — 래핑해 프리셋 하이라이트 유지
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작"><TimeSelect value={start} onChange={onStart} /></Field>
        <Field label={`종료${endHint ? ` (${endHint})` : ""}`}><TimeSelect value={end} onChange={onEnd} /></Field>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-micro text-fg-subtle self-center mr-0.5">빠른 선택</span>
        {DUR_PRESETS.map((m) => (
          /* [R-9] 심야 시작 + 프리셋이 자정을 넘으면 %1440 래핑 — 수업은 익일 종료로 저장, 블록은 start<end 검증이 막음 */
          <button key={m} type="button" onClick={() => onEnd(fromMin((toMin(start) + m) % 1440))}
            className={`btn btn-sm ${dur === m ? "badge-accent" : ""}`}>{durLabel(m)}</button>
        ))}
      </div>
    </div>
  );
}

// 반복(none/weekly/custom) + 커스텀 요일 + 종료일 — 수업/가용/불가 공통. noneLabel만 탭별 상이.
function RepeatField({ repeat, setRepeat, customWds, toggleWd, untilDate, setUntilDate, date, occurrencesCount, noneLabel }: {
  repeat: "none" | "weekly" | "custom"; setRepeat: (v: "none" | "weekly" | "custom") => void;
  customWds: number[]; toggleWd: (d: number) => void;
  untilDate: string; setUntilDate: (v: string) => void; date: string; occurrencesCount: number; noneLabel: string;
}) {
  return (
    <>
      <Field label="반복">
        <div className="flex rounded-md overflow-hidden border">
          {([["none", noneLabel], ["weekly", "매주"], ["custom", "커스텀"]] as const).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setRepeat(v)}
              className={`btn btn-sm flex-1 rounded-none border-0 ${repeat === v ? "badge-accent" : ""}`}>{lbl}</button>
          ))}
        </div>
      </Field>
      {repeat === "custom" && (
        <Field label="요일">
          <div className="flex gap-1">
            {WD.map((w, d) => (
              <button key={d} type="button" onClick={() => toggleWd(d)}
                className={`w-8 h-8 rounded text-caption border ${customWds.includes(d) ? "badge-accent" : ""}`}
               >{w}</button>
            ))}
          </div>
        </Field>
      )}
      {repeat !== "none" && (
        <Field label={`종료일 (${occurrencesCount}회)`}>
          <input type="date" className="input" value={untilDate} min={date} onChange={(e) => setUntilDate(e.target.value)} />
        </Field>
      )}
    </>
  );
}

// ── 관리자: 스케줄 추가 모달 ──
function CreateModal({
  resources,
  rooms,
  requestMode, // [UX H1] 강사=승인 요청 모드 — 버튼·안내 문구를 실제 동작과 일치
  defaultDate,
  defaultStart,
  lockInstructorId,
  defaultInstructorId,
  defaultOwner,
  ownerTz,
  onClose,
  onCreate,
  onCreateSeries,
  onCreateBlock,
}: {
  resources: ScheduleResources;
  rooms: Room[];
  requestMode?: boolean; // 강사(비관리자) — 수업 탭 제출이 승인 요청으로 전송됨
  defaultDate: string;
  defaultStart?: string; // 빈 곳 더블클릭 시 그 시각으로 프리필
  lockInstructorId?: number; // 강사 본인만 추가 가능할 때 — 본인 ID로 고정
  defaultInstructorId?: number; // 유저별 추가(스플릿 강사 컬럼) — 프리필(변경 가능)
  defaultOwner?: ScheduleResource | null;
  ownerTz?: CountryInfo | null; // [이슈1] 비KST 컬럼 추가 — 입력은 현지 시각, 저장 시 KST 역변환
  onClose: () => void;
  onCreate: (body: ScheduleCreateBody) => void;
  onCreateSeries: (bodies: ScheduleCreateBody[]) => void;
  onCreateBlock: (body: AvailabilityUpsertBody, options?: { closeOnSuccess?: boolean }) => Promise<boolean>;
}) {
  // [이슈1] 현지 tz의 (date, HH:mm) → KST 저장값. KST면 그대로. 저장은 항상 KST 단일 진실원.
  const tzActive = !!ownerTz && ownerTz.tz !== KST_TZ;
  const toKst = (dLocal: string, t: string) => (tzActive ? tzLocalToKst(dLocal, t, ownerTz!.tz) : { date: dLocal, time: t });
  // 유형: 수업 / 가용 / 불가 — 셋 다 같은 날짜·시간·반복(그날만=일회성 / 매주 / 커스텀) UX.
  const [type, setType] = useState<"session" | "available" | "unavailable" | "online_only">("session");

  // ── 수업 탭 ──
  const myCourses = lockInstructorId != null ? resources.courses.filter((c) => c.instructorId === lockInstructorId) : resources.courses;
  const [courseId, setCourseId] = useState<number>(myCourses[0]?.id ?? 0);
  const course = resources.courses.find((c) => c.id === courseId);
  const [instructorId, setInstructorId] = useState<number | "">(lockInstructorId ?? defaultInstructorId ?? course?.instructorId ?? "");
  const [roomId, setRoomId] = useState<number | "">("");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState(defaultStart ?? "16:00");
  // 진행시간은 코스(실제 수업) 데이터에서 — 종료시각 자동 계산(편집 가능)
  const courseDur = course?.durationMinutes ?? 90;
  // [R-9] 심야 시작(예: 23:30) + 진행시간이 자정을 넘으면 %1440 래핑('25:00' 금지) — end<start는
  //  익일 종료(자정 크로스)로 저장된다(아래 crossesMidnight 안내·BE 해석 규칙).
  const [end, setEnd] = useState(fromMin((toMin(defaultStart ?? "16:00") + (myCourses[0]?.durationMinutes ?? 90)) % 1440));
  const [memo, setMemo] = useState("");
  // [v0.1.14] 종류(수업/진단고사/상담 — 캘린더 필터 축) + 상담 등 단건 가격(Q1: 담당자=강사 재사용)
  const [kind, setKind] = useState<"class" | "level_test" | "counsel">("class");
  const [price, setPrice] = useState("");
  const [sessionMode, setSessionMode] = useState<"in_person" | "online">("in_person");
  // 색상 라벨: 생성 시 기본값은 개설 때 고른 코스 색(미지정 시 비움 → 백엔드가 코스/과목 색 폴백)
  const [color, setColor] = useState<string | undefined>(myCourses[0]?.color);
  const [status, setStatus] = useState<string>("scheduled");
  // ── 반복(그날만/매주/커스텀) + 종료일 ──
  const [repeat, setRepeat] = useState<"none" | "weekly" | "custom">("none");
  const [untilDate, setUntilDate] = useState(addDaysISO(defaultDate, 28));
  const [customWds, setCustomWds] = useState<number[]>([weekdayOf(defaultDate)]);
  const toggleWd = (d: number) => setCustomWds((ws) => (ws.includes(d) ? ws.filter((x) => x !== d) : [...ws, d].sort()));
  // 시작일~종료일 사이에서 반복 규칙에 맞는 날짜들(안전 상한 60).
  function occurrences(): string[] {
    if (repeat === "none") return [date];
    const wds = repeat === "weekly" ? [weekdayOf(date)] : customWds;
    if (!wds.length) return [];
    const out: string[] = [];
    for (let cur = date; cur <= untilDate; cur = addDaysISO(cur, 1)) {
      if (wds.includes(weekdayOf(cur))) out.push(cur);
      if (out.length >= 60) break;
    }
    return out;
  }
  const lockedInstructorName = lockInstructorId != null ? resources.instructors.find((i) => i.id === lockInstructorId)?.name : undefined;
  function pickCourse(id: number) {
    setCourseId(id);
    const c = resources.courses.find((x) => x.id === id);
    if (c) {
      if (lockInstructorId == null) setInstructorId(c.instructorId);
      setEnd(fromMin((toMin(start) + c.durationMinutes) % 1440)); // 코스 진행시간으로 종료 자동([R-9] 자정 래핑)
      setColor(c.color); // 코스 색을 기본 색으로
    }
  }
  function changeStart(v: string) {
    setStart(v);
    if (type === "session") setEnd(fromMin((toMin(v) + courseDur) % 1440)); // 수업만 코스 진행시간으로 종료 자동([R-9] 자정 래핑)
  }
  // [R-9] 수업은 end<start = 익일 종료(자정 크로스) 허용 — 같은 시각만 무효. (가용/불가 blockValid는
  //  기존 start<end 유지 — availability는 FE splitKstBand 분할·BE end<=start 400 정책 불변.)
  const crossesMidnight = type === "session" && end < start;
  const sessionValid = courseId && date && start !== end;

  // ── #2: 선택 시간대에 가용한 강사 안내(가용 강사 먼저) ──
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  useEffect(() => { api.availability.all().then(setBlocks).catch(() => setBlocks([])); }, []);
  const instAvailable = useCallback((instructorId: number): boolean => {
    const wd = weekdayOf(date);
    const s = toMin(start), e = toMin(end);
    const av = ownerWindows(blocks, "instructor", instructorId, "available").filter((w) => w.weekday === wd);
    if (!av.length || !av.some((w) => w.start <= s && e <= w.end)) return false; // 가용 미선언/미포함 → 불가
    const blocked = blocks.some((b) => b.kind === "unavailable" && b.ownerType === "instructor" && b.ownerId === instructorId && b.weekday === wd && s < toMin(b.endTime) && toMin(b.startTime) < e);
    return !blocked;
  }, [blocks, date, start, end]);
  const sortedInstructors = useMemo(
    () => [...resources.instructors].sort((a, b) => Number(instAvailable(b.id)) - Number(instAvailable(a.id))),
    [resources.instructors, instAvailable],
  );

  // ── [v0.1.13] 수업 학생 선택(단체) — 코스 활성 수강생 체크리스트(기본 전원 선택) ──
  //  전원 선택 = studentIds 미전송(기존 코스 파생과 동일 — 하위 호환). 부분 선택 = 명시 코호트 저장.
  //  수강생 산출은 캘린더와 동일 데이터(useEnrollments·useStudents 캐시 — 함수 통일: 활성 수강 기준).
  const { data: mEnrollments = [] } = useEnrollments();
  const { data: mStudents = [] } = useStudents();
  const courseRoster = useMemo(
    () =>
      mEnrollments
        .filter((en) => Number(en.courseId) === Number(courseId) && en.status === "active")
        .map((en) => {
          const st = mStudents.find((x) => Number(x.id) === Number(en.studentId));
          return { id: Number(en.studentId), name: st?.name ?? `학생 ${en.studentId}` };
        }),
    [mEnrollments, mStudents, courseId],
  );
  const [pickedStudents, setPickedStudents] = useState<Set<number> | null>(null); // null=전원(기본)
  useEffect(() => setPickedStudents(null), [courseId]); // 코스 변경 시 전원으로 리셋
  const effPicked = pickedStudents ?? new Set(courseRoster.map((r) => r.id));

  // ── 가용/불가 대상(오너) — 시간·날짜·반복은 수업과 공유 ──
  const lockOwner = lockInstructorId != null;
  const [bType, setBType] = useState<"instructor" | "student" | "room">(lockOwner ? "instructor" : (defaultOwner?.type ?? "instructor"));
  const [bId, setBId] = useState<number | "">(lockOwner ? lockInstructorId! : (defaultOwner?.id ?? ""));
  const ownerList = bType === "instructor" ? resources.instructors : bType === "student" ? resources.students : rooms.map((r) => ({ id: r.id, name: r.name }));
  const blockValid = bId !== "" && start < end && (repeat !== "custom" || customWds.length > 0);
  // 블록 생성: 반복 규칙(그날만=일회성 / 매주 / 커스텀)을 effectiveFrom·effectiveTo로 변환.
  //  - 일회성: 그 날짜 한 주만(effectiveFrom=effectiveTo=date).
  //  - 매주/커스텀: 선택 요일마다 date부터 종료일(untilDate)까지 반복.
  async function submitBlocks() {
    const kind = type === "unavailable" ? "unavailable" : type === "online_only" ? "online_only" : "available";
    // [이슈1] 비KST 입력: 현지 (date,시각)을 KST로 변환 후 요일·시각 확정. 반복은 KST 시각·요일 기준.
    // [버그수정 2026-07-06] 현지→KST 변환이 자정을 넘으면 두 블록으로 분할(splitKstBand) —
    //  이전엔 end<start로 저장돼 KST 뷰(축·렌더 모두 KST)에서 밴드가 사라졌다.
    const ks = toKst(date, start), ke = toKst(date, end);
    const parts = splitKstBand(ks, ke);
    const bodies: AvailabilityUpsertBody[] = [];
    if (repeat === "none") {
      for (const pt of parts) {
        bodies.push({ ownerType: bType, ownerId: Number(bId), kind, startTime: pt.startTime, endTime: pt.endTime, weekday: pt.weekday, effectiveFrom: pt.date, effectiveTo: pt.date });
      }
    } else {
      // 반복: 현지 요일 각각에 대해 (KST 요일 델타 + 분할) 적용. 종료일도 델타만큼 보정(미보정이던 것 정정).
      const wdShift = tzActive ? (weekdayOf(ks.date) - weekdayOf(date) + 7) % 7 : 0;
      const dayShift = tzActive ? Math.round((Date.parse(ks.date) - Date.parse(date)) / 86_400_000) : 0;
      const effTo = addDaysISO(untilDate, dayShift);
      const wds = repeat === "weekly" ? [weekdayOf(date)] : customWds;
      for (const wd of wds) {
        for (const [i, pt] of parts.entries()) {
          bodies.push({
            ownerType: bType,
            ownerId: Number(bId),
            kind,
            startTime: pt.startTime,
            endTime: pt.endTime,
            weekday: (wd + wdShift + i) % 7,
            effectiveFrom: pt.date,
            effectiveTo: addDaysISO(effTo, i),
          });
        }
      }
    }
    for (const body of bodies) {
      const ok = await onCreateBlock(body, { closeOnSuccess: false });
      if (!ok) return;
    }
    onClose();
  }
  function submitSession() {
    const seriesId = repeat === "none" ? undefined : Date.now();
    // 부분 선택 시에만 명시 코호트 전송(전원=미전송 — 코스 파생과 동일·하위 호환)
    const studentIds =
      pickedStudents != null && effPicked.size !== courseRoster.length ? [...effPicked] : undefined;
    // [이슈1] 각 발생일(현지)을 KST로 변환해 저장 — 종료는 시작과 같은 현지날짜 기준으로 변환.
    const mk = (dLocal: string): ScheduleCreateBody => {
      const ks = toKst(dLocal, start), ke = toKst(dLocal, end);
      return { courseId, instructorId: lockInstructorId ?? (instructorId || undefined), roomId: roomId || undefined, sessionDate: ks.date, startTime: ks.time, endTime: ke.time, memo: memo || undefined, color, status, seriesId, studentIds,
        kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined, mode: requestMode ? undefined : sessionMode };
    };
    const days = occurrences();
    if (days.length <= 1) onCreate(mk(days[0] ?? date));
    else onCreateSeries(days.map(mk));
  }

  return (
    // TBO-09 #4: 모달이 화면보다 커져 "추가" 버튼이 가려지는 문제 — 최대 크기 명시 + 본문만 스크롤 + 푸터 고정.
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div
        className="card w-[460px] max-w-[95vw] flex flex-col overflow-hidden"
        style={{ maxHeight: "min(85vh, 720px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-pad overflow-y-auto space-y-3 flex-1 min-h-0">
        <div className="flex rounded-md overflow-hidden border">
          {([["session", "수업"], ["available", "가용"], ["unavailable", "불가"], ["online_only", "온라인만"]] as const).map(([v, lbl]) => (
            <button key={v} className={`btn btn-sm flex-1 rounded-none border-0 ${type === v ? "badge-accent" : ""}`} onClick={() => setType(v)}>{lbl}</button>
          ))}
        </div>
        {requestMode && type === "session" && (
          /* [UX H1] 강사에게 실제 동작(승인 요청)을 사전 고지 — 버튼 라벨과 일치 */
          <div className="rounded-md px-2.5 py-1.5 text-caption" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}>
            수업은 매니저 승인 후 캘린더에 확정됩니다. 가용시간 변경이 기존 수업에 영향을 주면 승인 요청으로 전환됩니다.
          </div>
        )}
        {tzActive && (
          <p className="text-caption px-0.5 text-accent">
            🌐 {ownerTz!.name} 현지 시각으로 입력하세요 — 저장은 한국 시간(KST)으로 변환됩니다.
          </p>
        )}

        {type === "session" ? (
          <>
            {lockedInstructorName && <div className="text-caption text-fg-muted">{lockedInstructorName} (내 수업)</div>}
            <Field label="코스">
              <select className="input" value={courseId} onChange={(e) => pickCourse(Number(e.target.value))}>
                {myCourses.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subjectName}</option>)}
              </select>
            </Field>
            <Field label={`강사 ${instructorId && !instAvailable(Number(instructorId)) ? "· ⚠ 선택 시간에 불가" : ""}`}>
              {lockInstructorId == null ? (
                <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value ? Number(e.target.value) : "")}>
                  {sortedInstructors.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} {instAvailable(i.id) ? "· 가용" : "· 불가"}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={lockedInstructorName ?? "본인"} disabled readOnly />
              )}
            </Field>
            <Field label="강의실">
              <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">미지정</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            {/* [v0.1.13] 학생 선택(단체) — 코스 활성 수강생 체크리스트. 기본 전원(코스 파생과 동일),
                일부 해제 시 그 학생들만의 명시 코호트로 저장(개별·소그룹 수업). */}
            {/* [이슈1] 학생 검색 리스트 — 인원이 많아도 검색으로 좁혀 선택. 전체/해제 빠른 버튼. */}
            <Field label={`학생 (${effPicked.size}/${courseRoster.length}명 — 기본 전원)`}>
              {courseRoster.length === 0 ? (
                <p className="text-caption text-fg-subtle">이 코스의 활성 수강생이 없습니다 — 수강 등록 후 선택 가능</p>
              ) : (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-sm" onClick={() => setPickedStudents(new Set(courseRoster.map((r) => r.id)))}>전체</button>
                    <button type="button" className="btn btn-sm" onClick={() => setPickedStudents(new Set())}>해제</button>
                  </div>
                  <SearchableCheckList
                    items={courseRoster}
                    selected={effPicked}
                    placeholder="학생 이름 검색"
                    onToggle={(id) => { const n = new Set(effPicked); if (n.has(id)) n.delete(id); else n.add(id); setPickedStudents(n); }}
                  />
                </div>
              )}
            </Field>
            <DateField value={date} onChange={setDate} />
            <TimeRangeField start={start} end={end} onStart={changeStart} onEnd={setEnd} endHint={`진행 ${courseDur}분`} />
            {crossesMidnight && (
              /* [R-9] 자정 크로스 안내 — 익일 종료로 저장(단일 세션·sessionDate=시작일) */
              <p className="text-caption text-accent">🌙 종료가 시작보다 이르므로 <b>다음날 {end} 종료</b>(자정 크로스)로 저장됩니다.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="종류">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "class" | "level_test" | "counsel")}>
                  <option value="class">일반 수업</option>
                  <option value="level_test">진단고사</option>
                  <option value="counsel">상담</option>
                </select>
              </Field>
              {kind !== "class" ? (
                <Field label="가격(원) — 선택">
                  <input className="input" type="number" min={0} max={100000000} placeholder="예: 50000" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
              ) : <div />}
              <Field label="상태">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.keys(STATUS_LABEL).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}{s === "held" ? " (시수 측정)" : isCanceledStatus(s) ? " (시수 미측정)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {!requestMode && (
                <Field label="수업방식">
                  <select className="input" value={sessionMode} onChange={(e) => setSessionMode(e.target.value as typeof sessionMode)}>
                    <option value="in_person">대면</option>
                    <option value="online">비대면</option>
                  </select>
                </Field>
              )}
              <Field label="색상"><ColorPicker value={color} onChange={setColor} /></Field>
            </div>
            <Field label="메모"><textarea className="input min-h-[52px] py-1.5" rows={2} placeholder="선택 — 메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <RepeatField repeat={repeat} setRepeat={setRepeat} customWds={customWds} toggleWd={toggleWd}
              untilDate={untilDate} setUntilDate={setUntilDate} date={date} occurrencesCount={occurrences().length} noneLabel="그날만" />
          </>
        ) : (
          <>
            {lockedInstructorName && <div className="text-caption text-fg-muted">{lockedInstructorName} (본인)</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="대상">
                <select className="input" value={bType} disabled={lockOwner}
                  onChange={(e) => { setBType(e.target.value as typeof bType); setBId(""); }}>
                  <option value="instructor">강사</option>
                  <option value="student">학생</option>
                  <option value="room">강의실</option>
                </select>
              </Field>
              <Field label={bType === "instructor" ? "강사" : bType === "student" ? "학생" : "강의실"}>
                <select className="input" value={bId} disabled={lockOwner} onChange={(e) => setBId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">선택</option>
                  {ownerList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>
            <DateField value={date} onChange={setDate} />
            <TimeRangeField start={start} end={end} onStart={changeStart} onEnd={setEnd} />
            <RepeatField repeat={repeat} setRepeat={setRepeat} customWds={customWds} toggleWd={toggleWd}
              untilDate={untilDate} setUntilDate={setUntilDate} date={date} occurrencesCount={occurrences().length} noneLabel="일회성" />
            <p className="text-caption text-fg-muted">{repeat === "none" ? "일회성 — 이 날짜에 한 번만 적용." : "매주 반복 — 이 날짜부터 종료일까지."}</p>
          </>
        )}
        </div>
        {/* 고정 푸터 — 스크롤과 무관하게 추가/취소 버튼 항상 노출 */}
        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0">
          <button className="btn" onClick={onClose}>취소</button>
          {type === "session" ? (
            <button className="btn btn-primary" disabled={!sessionValid || (repeat !== "none" && occurrences().length === 0)} onClick={submitSession}>
              {requestMode ? "승인 요청 보내기" : repeat === "none" ? "수업 추가" : `반복 추가 (${occurrences().length}회)`}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!blockValid} onClick={submitBlocks}>
              {AVAILABILITY_KIND_LABEL[type === "unavailable" ? "unavailable" : type === "online_only" ? "online_only" : "available"]} 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-fg-muted">{children}</dt>;
}
// Field·ColorPicker는 SessionEditFields.tsx에서 import(폼 프리미티브 단일 소스).
