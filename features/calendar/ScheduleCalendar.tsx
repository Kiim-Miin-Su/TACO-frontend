"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScheduleRow, Room, Conflict, ScheduleResources, ScheduleResource, AvailabilityBlock, AccountRole, Attendance } from "@/types";
import { api, type SchedulePatchBody, type ScheduleCreateBody, type AvailabilityUpsertBody } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
// 시간·요일 유틸은 lib/domain/schedule 단일 소스(감사 D — 파일별 중복 toMin/fromMin/pad/WD 제거)
import { weekDates, weekdayOf, layoutLanes, teachingHours, toMin, fromMin, pad2 as pad, WEEKDAYS_KO as WD, ownerWindows } from "@/lib/domain/schedule";
import {
  PALETTE, STATUS_LABEL, MAX_SPLIT,
  matchesStatusFilter, matchesResourceFilter, isGroupSession, sortByDateAsc,
  buildMixedSplitColumns, rowInResource, cloneSessionBody, resolvePasteCourseId,
  type StatusFilter, type SplitDim, type ListGroupBy, type PasteTarget, type MixedPick, densityOf,
  KIND_FILTERS, KIND_FILTER_LABEL, type SessionKindFilter } from "@/lib/domain/lantiv";
import { useAttendance, useStudents, useEnrollments, useCourses, useCreateViewPreset, useScheduleRequests } from "@/lib/queries";
// 국가·시차(피드백 2026-07-02): KST 단일 진실원 → 표시 전용 변환(lib/domain/tz), 비KST 뷰는 편집 잠금
import { COUNTRIES, KST_TZ, countryByCode, shiftRowsToTz, tzOffsetFromKst, tzLocalToKst, kstBlockToTzWindow, type CountryInfo, type TzShiftedRow } from "@/lib/domain/tz";
import { CountryInput } from "./CountryInput";
import { CalendarViewTabs } from "./CalendarViewTabs";
import { serializeViewPreset, presetToState } from "@/lib/domain/presets";
import type { CalendarViewPreset } from "@/types";
import { exportNodeAsImage } from "@/lib/export";
import { useTacoStore } from "@/lib/store";
import { isAdmin, roleLabel } from "@/lib/roles";
import { currentClaims } from "@/lib/auth";
import { ResourcePanel } from "./ResourcePanel";
import { ResourceDetailCard } from "./ResourceDetailCard";
import { ParticipantsCard } from "./ParticipantsCard";
import { SessionEditFields, ColorPicker, Field, TimeSelect } from "./SessionEditFields";
import { CalendarSplitPane, type SplitPaneDef } from "./CalendarSplitPane";
import { CalendarFilterBar, type Period } from "./CalendarFilterBar";
import { SessionListPanel } from "./SessionListPanel";
import { SessionDetailPanel } from "./SessionDetailPanel";

// ── 그리드 상수 (애플/구글 캘린더 스타일: 넓고 시간 단위가 또렷하게) ──
const START_H = 8,
  END_H = 22,
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

const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;

// [이슈1] 편집/생성 패치의 현지 시각(sessionDate·startTime·endTime)을 KST 저장값으로 역변환.
//  시작 시각 기준으로 KST 날짜 확정 — 저장은 항상 KST 단일 진실원(무결성).
function kstPatchTimes<T extends { sessionDate?: string; startTime?: string; endTime?: string }>(patch: T, tz: string): T {
  if (tz === KST_TZ || !patch.sessionDate || !patch.startTime) return patch;
  const ks = tzLocalToKst(patch.sessionDate, patch.startTime, tz);
  const ke = patch.endTime ? tzLocalToKst(patch.sessionDate, patch.endTime, tz) : undefined;
  return { ...patch, sessionDate: ks.date, startTime: ks.time, ...(ke ? { endTime: ke.time } : {}) };
}

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
const endMinOf = (r: ScheduleRow) => (r.endTime ? toMin(r.endTime) : startMinOf(r) + r.durationMinutes);

type View = "month" | "week" | "day";
type ColorBy = "subject" | "instructor" | "room" | "student";
type Resizing = { id: number; edge: "top" | "bottom"; startClientY: number; origStart: number; origEnd: number;
  gm: number; gmax: number; tz?: string; dateLocal: string }; // [이슈2] 시차 뷰 리사이즈: 축 경계·tz·현지날짜
type Pending = { row: ScheduleRow; patch: SchedulePatchBody; label: string };

export function ScheduleCalendar() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  // [이슈1] 편집 대상이 비KST 컬럼(현지 시각 표시)이면 그 tz — 저장 시 현지→KST 역변환 기준. KST면 null.
  const [editingTz, setEditingTz] = useState<CountryInfo | null>(null);
  const openEditor = useCallback((r: ScheduleRow, tz: CountryInfo | null = null) => { setEditing(r); setEditingTz(tz); }, []);
  const [selEvent, setSelEvent] = useState<number | null>(null); // 단일 클릭 선택(애플식 — 리사이즈 핸들 노출)
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<{ id: number; start: number; end: number } | null>(null);
  const [msg, setMsg] = useState("");
  // 토스트 자동 사라짐(성공·정보 알림이 화면에 계속 남지 않도록)
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  // ── 자원(레일)·가용 ──
  const [resources, setResources] = useState<ScheduleResources | null>(null);
  // [A안 통합 2026-07-03] "유저별 스케줄"과 상단 필터바 = **단일 선택 모델**.
  //  이전엔 selected(서버 파라미터)와 필터바(클라 필터)가 독립이라 겹치면 암묵적 교집합이 됐음.
  //  이제 selected는 별도 상태가 아니라 **필터에서 파생**: 리소스 선택 합계가 정확히 1명이면
  //  그 유저 = 개인 모드(서버 파라미터 조회·가용밴드·상세 카드·PNG 이름). 필터바 칩에 항상 표시되어
  //  "지금 무엇으로 걸러져 있는지"가 한 곳에 보인다. 우측 패널 클릭 = 그 차원 필터를 1명으로 세팅.
  // (selected 정의는 필터 상태 아래 — 파생 useMemo)
  const [selBlocks, setSelBlocks] = useState<AvailabilityBlock[]>([]); // 선택 자원의 불가시간(밴드 표시)
  // [피드백 2026-07-03] 스플릿 컬럼별 가용·불가 시각화 — 전체 availability(단일 소스, 컬럼 유저 매칭)
  const [allBlocks, setAllBlocks] = useState<AvailabilityBlock[]>([]);
  const reloadAllBlocks = useCallback(() => {
    api.availability.all().then(setAllBlocks).catch(() => {});
  }, []);
  useEffect(() => { reloadAllBlocks(); }, [reloadAllBlocks]);

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
  // 데모 본인 강사 식별(실제로는 JWT sub) — 사이드바와 동일하게 첫 강사를 '나'로 간주
  const myInstructorId = isInstructor ? resources?.instructors[0]?.id : undefined;
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
  const [colorBy, setColorBy] = useState<ColorBy>("subject");
  const [fInstructors, setFInstructors] = useState<Set<number>>(new Set());
  const [fSubjects, setFSubjects] = useState<Set<string>>(new Set());
  const [fRooms, setFRooms] = useState<Set<number>>(new Set());
  const [fStudents, setFStudents] = useState<Set<number>>(new Set());
  // Lantiv 확장: 상태(출석/지각/결강/보강) · 그룹 수업만 · 기간(from/to, 뷰 기간 대신 조회)
  const [fStatuses, setFStatuses] = useState<Set<StatusFilter>>(new Set());
  // [v0.1.14 #2] 종류 필터(수업/진단고사/상담) — 빈 Set=전체. 프리셋 직렬화 편입은 후속(contracts 필드 필요).
  const [fKinds, setFKinds] = useState<Set<"class" | "level_test" | "counsel">>(new Set());
  const [groupOnly, setGroupOnly] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);
  // [이슈3] 표(패널)별 날짜 범위 — 캘린더(from/to)로 표마다 다르게(예: 왼쪽 7/6~7/8, 오른쪽 7/6~7/10).
  //  미설정=전역 기간을 따름. from만 있고 to 없으면 from 하루.
  const [paneRange, setPaneRange] = useState<Partial<Record<SplitDim, { from: string; to: string }>>>({});
  // [B-3 #5] 표별 cherry-pick 날짜(불연속 집합, 최대 14) — 설정 시 paneRange(연속 범위)보다 우선.
  const [panePicked, setPanePicked] = useState<Partial<Record<SplitDim, string[]>>>({});
  // [B-2 #2] 표별 종류(kind) 필터 — 전역 fKinds와 별개로 그 표에만 적용(빈 Set=전체).
  const [paneKinds, setPaneKinds] = useState<Partial<Record<SplitDim, Set<SessionKindFilter>>>>({});
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
  //  저장은 항상 KST(단일 진실원) — 비KST 표시는 읽기 전용(편집·드래그·복제 잠금).
  // 학생 국가·수강·코스(붙여넣기 코스 재배정 + 국가 필터) — TanStack Query 캐시 공유.
  const { data: allStudents = [] } = useStudents();
  const { data: allEnrollments = [] } = useEnrollments();
  const { data: allCourses = [] } = useCourses();
  const [country, setCountry] = useState<CountryInfo | null>(null);
  const [paneCountry, setPaneCountry] = useState<Partial<Record<SplitDim, CountryInfo | null>>>({});
  const paneTzOf = (dim: SplitDim) => (dim in paneCountry ? (paneCountry[dim] ?? null) : country);
  // ── 뷰 프리셋(TBO-12 P1) — DB 자산(calendar_view_presets). 직렬화는 lib/domain/presets 단일 소스 ──
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const createViewPreset = useCreateViewPreset();
  const applyPreset = (p: CalendarViewPreset) => {
    const st = presetToState(p);
    setView(st.view); setPeriod(st.period); setQ(st.q); setColorBy(st.colorBy as ColorBy);
    setFInstructors(st.fInstructors); setFStudents(st.fStudents); setFRooms(st.fRooms);
    setFSubjects(st.fSubjects); setFStatuses(st.fStatuses); setFKinds(st.fKinds); setGroupOnly(st.groupOnly);
    setCountry(st.country); setPaneCountry(st.paneCountry);
    setClosedPanes(new Set()); // 표 닫힘 상태 초기화 — 프리셋의 스플릿 구성을 그대로 복원
    setActivePresetId(Number(p.id));
    setMsg(`프리셋 적용 — ${p.name}`);
  };
  const saveCurrentPreset = async (name: string) => {
    await createViewPreset.mutateAsync(serializeViewPreset(name, {
      view, period, q, colorBy, fInstructors, fStudents, fRooms, fSubjects, fStatuses, fKinds,
      groupOnly, country, paneCountry,
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
  const [tzPickerFor, setTzPickerFor] = useState<{ colKey: string; studentId: number } | null>(null);

  // 학생 필터에 해외(비KR) 학생 포함 여부 — 개별 시차 컬럼도 조회 ±1일 확장이 필요(날짜 밀림).
  const anyStudentColTz = useMemo(
    () => [...fStudents].some((id) => studentTzOf(id) != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- studentTzOf는 allStudents·override 파생
    [fStudents, allStudents, studentTzOverride],
  );
  const anyTzActive = (country != null && country.tz !== KST_TZ)
    || Object.values(paneCountry).some((c) => c != null && c.tz !== KST_TZ)
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
  const previewRef = useRef<{ id: number; start: number; end: number } | null>(null);

  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
  // 기간(period)을 지정하면 **뷰 자체가 그 날짜들로 재구성**(피드백: 4일 선택=4일만 표시). 상한 14일.
  const dates = useMemo(() => {
    if (!period) return weekDates(weekStart);
    const out: string[] = [];
    for (let d = period.from; d <= period.to && out.length < 14; d = addDaysISO(d, 1)) out.push(d);
    return out.length ? out : [period.from];
  }, [period, weekStart]);

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
    if (!selected) return {};
    if (selected.type === "instructor") return { instructorId: selected.id };
    if (selected.type === "room") return { roomId: selected.id };
    return { studentId: selected.id };
  }, [selected]);

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

  const roomsLoadedRef = useRef(false); // [L2] 클로저가 초기 rooms를 봐서 매번 재요청하던 문제
  const load = useCallback(async () => {
    try {
      const [sc, rm] = await Promise.all([
        api.schedule.list({ ...fetchRange, ...selQuery }),
        roomsLoadedRef.current ? Promise.resolve(null) : api.rooms.list(),
      ]);
      setRows(sc);
      if (rm) { setRooms(rm); roomsLoadedRef.current = true; }
      setMsg("");
    } catch {
      setMsg("백엔드 API에 연결할 수 없습니다. 서버 상태와 API 주소(NEXT_PUBLIC_API_URL) 설정을 확인하세요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRange.from, fetchRange.to, selQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // 자원 목록(1회)
  useEffect(() => {
    api.schedule
      .resources()
      .then(setResources)
      .catch(() => {});
  }, []);

  // 선택 자원의 불가시간(밴드)
  useEffect(() => {
    if (!selected) {
      setSelBlocks([]);
      return;
    }
    api.availability
      .list(selected.type, selected.id)
      .then(setSelBlocks)
      .catch(() => setSelBlocks([]));
  }, [selected]);

  // ── 색/라벨 ──
  const colorOf = useCallback(
    (r: ScheduleRow) =>
      isCanceledStatus(r.status) // 결강·취소 → 회색(시수 미측정·충돌 제외 시각화)
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
      if (fSubjects.size && !fSubjects.has(r.subjectName)) return false;
      // Lantiv 상태 필터(출석/지각/결강/보강) — 세션 status + 강사·학생 출결 조합(lib/domain/lantiv)
      if (!matchesStatusFilter(r, attBySession.get(Number(r.id)) ?? [], fStatuses)) return false;
      if (fKinds.size && !fKinds.has((r.kind ?? "class") as "class" | "level_test" | "counsel")) return false; // 종류(kind) — 미지정=class 하위호환
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
  }, [rows, q, fInstructors, fSubjects, fRooms, fStudents, fStatuses, fKinds, groupOnly, attBySession, countryStudentIds]);

  const anyFilter =
    q.trim() !== "" || fInstructors.size || fSubjects.size || fRooms.size || fStudents.size ||
    fStatuses.size || fKinds.size || groupOnly || period != null || country != null;
  const clearFilters = () => {
    setQ("");
    setFInstructors(new Set());
    setFSubjects(new Set());
    setFRooms(new Set());
    setFStudents(new Set());
    setFStatuses(new Set());
    setFKinds(new Set());
    setGroupOnly(false);
    setPeriod(null);
    setCountry(null);
    setPaneCountry({});
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

  const rowsOfColumn = (c: Col, src: ScheduleRow[] = filtered) =>
    src.filter(
      (r) =>
        r.sessionDate === c.date &&
        (c.resType != null
          ? rowInResource(r, c.resType, c.resId!)
          : c.noRoom
            ? r.roomId == null // [L1] 미지정 컬럼 = 강의실 없는 세션만
            : c.roomId == null || r.roomId === c.roomId),
    );

  // 가용/불가(Block) 밴드 — 선택 자원 기준. week=요일 매칭 모든 컬럼, day=룸이면 해당 컬럼만/그 외 전체.
  type Band = { id: number; kind: string; startMin: number; endMin: number; top: number; h: number; editable: boolean };
  // gridMin: 렌더 그리드의 시작 분(개별 시차로 축이 0~24h일 때 top 정합 — renderTimeGrid가 전달)
  // tz: 컬럼이 비KST(해외 학생 등)면 그 tz — KST 블록을 그 나라 로컬로 변환해 표시(이슈1). KST·tz 모두
  //  kstBlockToTzWindow 단일 함수로 매칭·변환(세션 엔진 재사용·단위테스트 — 이슈3).
  const bandsOfColumn = (c: { date: string; roomId?: number; resType?: SplitDim; resId?: number }, gridMin: number = GRID_MIN, tz?: string | null): Band[] => {
    const isTz = !!tz && tz !== KST_TZ;
    const axisClamp = isTz ? (mm: number) => Math.max(0, Math.min(24 * 60, mm)) : clampMin;
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
  const reloadSelBlocks = useCallback(() => {
    if (selected) api.availability.list(selected.type, selected.id).then(setSelBlocks).catch(() => {});
    reloadAllBlocks(); // 스플릿 컬럼 밴드(전체 소스)도 동기화
  }, [selected, reloadAllBlocks]);

  // 가용/불가 블록 생성(모달에서 호출)
  async function createBlock(body: AvailabilityUpsertBody) {
    try {
      await api.availability.upsert(body);
      setCreating(null);
      // [버그수정 2026-07-03 이슈3·4] 스플릿 컬럼 밴드는 allBlocks 소스라 항상 갱신해야 새 블록(학생 불가·
      //  가용 초록)이 즉시 렌더됨. 기존엔 selected==owner일 때만 갱신 → 다른 유저 컬럼에 추가하면 미표시.
      reloadSelBlocks(); // 내부에서 reloadAllBlocks(전체) + selBlocks(선택 유저) 동시 갱신
    } catch (e) {
      // 겹침(409) 등 백엔드 메시지를 그대로 노출 — "이미 지정된 불가시간과 겹칩니다" 경고.
      const err = e as { response?: { data?: { message?: string } } };
      setMsg(err.response?.data?.message ?? "가용/불가 저장 실패");
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
    try { await api.availability.remove(id); reloadSelBlocks(); } catch { setMsg("삭제 실패"); }
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
      const err = e as { response?: { data?: { message?: string } } };
      setMsg(err.response?.data?.message ?? "삭제 실패"); reloadSelBlocks();
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
      const err = e as { response?: { data?: { message?: string } } };
      setMsg(err.response?.data?.message ?? "적용 실패");
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
      const e = next.endTime ? toMin(next.endTime) : s + next.durationMinutes;
      next.durationMinutes = Math.max(1, e - s);
    }
    if (patch.durationMinutes != null) {
      next.durationMinutes = patch.durationMinutes;
      if (next.startTime && !patch.endTime) next.endTime = fromMin(toMin(next.startTime) + patch.durationMinutes);
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
        setMsg("수정 실패");
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
    const end = body.endTime ?? fromMin(toMin(start) + (body.durationMinutes ?? c?.durationMinutes ?? 60));
    return {
      id: -Date.now(), courseId: body.courseId,
      instructorId: body.instructorId ?? c?.instructorId ?? 0, roomId: body.roomId,
      sessionDate: body.sessionDate, weekday: weekdayOf(body.sessionDate),
      startTime: start, endTime: end, durationMinutes: Math.max(1, toMin(end) - toMin(start)),
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
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
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selEvent, clip, cursor, canAdd]);

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
    // [이슈2] 시차 컬럼 드롭이면 현지(날짜·분)를 KST로 변환. 비교·저장은 항상 KST 원본 기준(무결성).
    const kst = tzCellToKst(d.date, d.start, d.tz);
    const orig = rows.find((x) => x.id === d.id) ?? d.row; // KST 원본(seriesId·비교용)
    // Ctrl+드래그 = 복제(원본 유지, 드롭 지점에 새 세션) — cloneSessionBody 무결성 규칙 적용.
    if (d.copy) {
      pasteAt(orig, { date: kst.date, startMin: kst.startMin, resType: d.resType, resId: d.resId, roomId: d.roomId });
      return;
    }
    const newRoom = d.roomId ?? orig.roomId;
    // 스플릿(강사) 컬럼으로 드롭 → 강사 재배정. 학생 컬럼은 재배정 없음(코호트는 enrollment 파생 — 무결성).
    const newInstructor = d.resType === "instructor" && d.resId != null ? d.resId : orig.instructorId;
    if (kst.date === orig.sessionDate && kst.startMin === startMinOf(orig) && newRoom === orig.roomId && newInstructor === orig.instructorId)
      return;
    requestChange(
      orig,
      {
        sessionDate: kst.date, startTime: fromMin(kst.startMin), durationMinutes: d.dur, roomId: newRoom,
        ...(newInstructor !== orig.instructorId ? { instructorId: newInstructor } : {}),
      },
      newInstructor !== orig.instructorId ? "강사 재배정 및 이동" : `${fromMin(kst.startMin)}로 이동`,
    );
  };
  const onEventDown = (e: React.PointerEvent, r: ScheduleRow) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grab = ((e.clientY - rect.top) / HOUR_H) * 60;
    moveRef.current = {
      id: r.id, row: r, dur: r.durationMinutes, grab, startClientY: e.clientY, moved: false,
      colKey: "", date: r.sessionDate, roomId: r.roomId, start: startMinOf(r),
      copy: e.ctrlKey || e.metaKey, // Ctrl/⌘ 누른 채 드래그 = 복제
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
    const pv = { id: rz.id, start, end };
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
    const kstEnd = tzCellToKst(rz.dateLocal, pv.end, rz.tz);
    requestChange(
      r,
      { sessionDate: kstStart.date, startTime: fromMin(kstStart.startMin), endTime: fromMin(kstEnd.startMin) },
      `${fromMin(pv.start)}–${fromMin(pv.end)}로 시간 조정`,
    );
  };
  const onResizeDown = (e: React.PointerEvent, r: ScheduleRow, edge: "top" | "bottom", tz?: string | null, gm: number = GRID_MIN, gmax: number = END_H * 60) => {
    e.stopPropagation();
    resizingRef.current = { id: r.id, edge, startClientY: e.clientY, origStart: startMinOf(r), origEnd: endMinOf(r), gm, gmax, tz: tz ?? undefined, dateLocal: r.sessionDate };
    previewRef.current = { id: r.id, start: startMinOf(r), end: endMinOf(r) };
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
  const showNow = nowMin >= GRID_MIN && nowMin <= END_H * 60;

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
  const renderTimeGrid = (cols: Col[], tzc?: CountryInfo | null, paneKindSet?: Set<SessionKindFilter>) => {
    const tzActive = !!tzc && tzc.tz !== KST_TZ;
    // 학생 개별 시차(피드백 2026-07-03 #1): 그리드 tz(전역/표별 — 명시 선택)가 없을 때만
    //  학생 컬럼의 country 파생 tz가 동작. 축은 컬럼 하나라도 tz면 0~24h(다른 나라 새벽 대비).
    const anyColTz = !tzActive && cols.some((c) => c.tzc != null);
    const axisTz = tzActive || anyColTz;
    const startH = axisTz ? 0 : START_H, endH = axisTz ? 24 : END_H; // 시차로 새벽·심야 이동 대비 전일 축
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
    const offMin = tzActive ? tzOffsetFromKst(tzc.tz, cols[0]?.date ?? todayISO()) : 0;
    const offLabel = `${offMin >= 0 ? "+" : "-"}${Math.floor(Math.abs(offMin) / 60)}${Math.abs(offMin) % 60 ? ":" + pad(Math.abs(offMin) % 60) : ""}h`;
    const isSplitGrid = cols[0]?.resType != null;
    // 데일리 스플릿(피드백 최종): **요일 열 폭은 주간과 동일(COL_MIN 고정)**, 그 안을 인원수로
    //  서브분할(같은 크기 요일 열을 늘리는 게 아님 — 컴팩트). 일수가 적으면 flex로 화면을 채움.
    const dayCount = isSplitGrid ? new Set(cols.map((c) => c.date)).size : cols.length;
    const perDay = isSplitGrid ? Math.max(1, Math.round(cols.length / Math.max(1, dayCount))) : 1;
    const subW = isSplitGrid ? Math.floor(COL_MIN / perDay) : COL_MIN;
    // 텍스트 밀도 단계(서브열 폭 기준) — 단일 함수 densityOf(lib/domain/lantiv, vitest)로 통일(R2)
    const textMode = densityOf(subW, isSplitGrid);
    const minCol = subW;
    return (
              <div className="card overflow-x-auto">
                {anyColTz && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b text-[12px]" style={{ borderColor: "var(--color-line)", background: "var(--color-canvas-subtle)" }}>
                    <span>🌐</span>
                    <span className="font-semibold">학생 국가별 시간 표시 중</span>
                    <span className="badge text-[10px]" title="해외 학생 컬럼은 그 나라 시간으로 표시되며 보기 전용 — 편집은 한국(KST) 컬럼에서">국기 컬럼 = 그 나라 시간 · 보기 전용</span>
                  </div>
                )}
                {tzActive && tzc && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b text-[12px]" style={{ borderColor: "var(--color-line)", background: "var(--color-canvas-subtle)" }}>
                    <span>{tzc.flag}</span>
                    <span className="font-semibold">{tzc.name} 시간</span>
                    <span className="text-fg-subtle mono">KST{offLabel}</span>
                    <span className="badge text-[10px]" title="저장 시간은 항상 한국 시간(KST) — 시차 표시는 변환본입니다">보기 전용 · 편집은 한국 시간에서</span>
                  </div>
                )}
                <div className="flex" style={{ minWidth: GUTTER_W + (isSplitGrid ? dayCount * COL_MIN : cols.length * COL_MIN) }}>
                  {/* 시간 거터 */}
                  <div className="shrink-0 sticky left-0 z-10 bg-canvas" style={{ width: GUTTER_W }}>
                    <div style={{ height: HEADER_H }} />
                    <div className="relative" style={{ height: gridH }}>
                      {Array.from({ length: endH - startH + 1 }, (_, i) => (
                        <span
                          key={i}
                          className="absolute right-2 text-[11px] text-fg-subtle mono"
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
                      const colTz = !!colTzc && colTzc.tz !== KST_TZ;
                      // [B-2] 표별 종류 필터(빈 Set=전체) — 전역 fKinds는 filtered 단계에서 이미 적용
                      const kindPass = (r: ScheduleRow) => !paneKindSet?.size || paneKindSet.has((r.kind ?? "class") as SessionKindFilter);
                      const colRows = rowsOfColumn(c, colTz ? rowsForTz(colTzc.tz) : filtered).filter(kindPass);
                      // [B-4 #9] 강사 본인 pending 요청 고스트(승인 대기 시각화) — KST 컬럼 전용·표시 전용
                      const colGhosts = !colTz && isInstructor
                        ? pendingGhosts.filter((g) => g.sessionDate === c.date && (c.resType == null || (c.resType === "instructor" && Number(c.resId) === Number(g.instructorId))))
                        : [];
                      const sOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.start : startMinOf(r));
                      const eOf = (r: ScheduleRow) => (preview && preview.id === r.id ? preview.end : endMinOf(r));
                      const lanes = layoutLanes(colRows.map((r) => ({ id: r.id, start: sOf(r), end: eOf(r) })));
                      const bands = bandsOfColumn(c, gridMin, colTz ? colTzc.tz : null); // [이슈1] 시차 컬럼도 변환해 표시
                      const isToday = c.date === todayISO();
                      return (
                        <div
                          key={c.key}
                          className="flex-1 border-l"
                          style={{
                            borderColor: c.resType && c.firstOfDate ? "var(--color-line)" : "var(--color-line-muted)",
                            borderLeftWidth: c.resType && c.firstOfDate ? 2 : undefined,
                            minWidth: minCol,
                            flex: `1 0 ${minCol}px`, // 비율 유지 + 남는 폭은 균등 확장(화면 채움 — 피드백)
                          }}
                        >
                          {/* 헤더: 스플릿=날짜+리소스명 · 주간=요일+날짜(오늘 강조) · 일간=강의실 */}
                          <div
                            className="flex flex-col items-center justify-center gap-0.5 border-b relative"
                            style={{ height: HEADER_H, borderColor: "var(--color-line)" }}
                          >
                            {c.resType ? (
                              <>
                                {c.sub && (
                                  <span className={`text-[10px] ${isToday ? "text-accent font-semibold" : "text-fg-subtle"}`}>
                                    {c.sub}
                                  </span>
                                )}
                                {/* 이름은 truncate, 국기 버튼은 truncate 밖(잘림·클릭 좌표 소실 방지) */}
                                <span className="flex items-center gap-0.5 max-w-full px-1 min-w-0">
                                  <span
                                    className="text-[12px] font-semibold truncate min-w-0"
                                    title={`${c.label}${!tzActive && c.tzc ? ` — ${c.tzc.name} 시간(개별 시차)` : ""}`}
                                  >
                                    {c.label}
                                  </span>
                                  {canAdd && c.resType != null && c.resId != null && (
                                    <button
                                      className="shrink-0 hover:opacity-70 text-[11px] leading-none px-0.5"
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
                                      className="shrink-0 hover:opacity-70 text-[12px] leading-none px-0.5 py-0.5 -my-0.5"
                                      title={`${c.label} 컬럼 시차 변경(보기 전용 임시)`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTzPickerFor((prev) => (prev?.colKey === c.key ? null : { colKey: c.key, studentId: c.resId! }));
                                      }}
                                    >
                                      {c.tzc ? c.tzc.flag : "🌐"}
                                    </button>
                                  )}
                                </span>
                                {/* 시차 픽커 팝오버 — truncate 밖(헤더 레벨)에 렌더해 잘림 방지 */}
                                {tzPickerFor?.colKey === c.key && (
                                  <span className="absolute left-0 top-full mt-0.5 z-40 card shadow-lg p-1.5 w-44 block" onClick={(e) => e.stopPropagation()}>
                                    <select
                                      className="input h-7 w-full text-[11px]"
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
                                <span className={`text-[11px] ${isToday ? "text-accent font-semibold" : "text-fg-subtle"}`}>
                                  {c.label}
                                </span>
                                <span
                                  className={`grid place-items-center text-[15px] font-semibold rounded-full ${isToday ? "text-white" : "text-fg"}`}
                                  style={{ width: 28, height: 28, background: isToday ? "var(--color-accent)" : "transparent" }}
                                >
                                  {Number(c.date.slice(8))}
                                </span>
                              </>
                            ) : (
                              <span className="text-[13px] font-semibold truncate px-1">{c.label}</span>
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
                                title={b.kind === "unavailable" ? "불가시간 — 클릭 선택 · 드래그 이동 · 끝 드래그 시간조절 · 더블클릭 수정" : "가용시간 — 클릭 선택 · 드래그 이동 · 더블클릭 수정"}
                                className={`absolute left-0 right-0 ${!b.editable ? "pointer-events-none" : on ? "cursor-move" : "cursor-pointer"}`}
                                style={
                                  b.kind === "unavailable"
                                    ? {
                                        top: b.top, height: b.h,
                                        background:
                                          "repeating-linear-gradient(45deg, rgba(110,118,129,.16) 0 6px, rgba(110,118,129,.28) 6px 12px)",
                                        outline: on ? "2px solid var(--color-fg-muted)" : undefined,
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
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "top")} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b cursor-ns-resize" style={{ background: "var(--color-fg-muted)" }} />
                                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id, c.date); }} className="absolute right-0.5 top-0.5 w-4 h-4 grid place-items-center rounded text-[10px] text-white" style={{ background: "var(--color-danger)" }} title="삭제">✕</button>
                                    <div onPointerDown={(e) => bDownResize(e, c, b, "bottom")} className="absolute left-1/2 -translate-x-1/2 bottom-0 w-6 h-2 rounded-t cursor-ns-resize" style={{ background: "var(--color-fg-muted)" }} />
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
                                <div className="h-0.5" style={{ background: "var(--color-accent)" }} />
                                <span className="absolute left-1 -top-2.5 px-1 rounded text-[10px] text-white mono" style={{ background: "var(--color-accent)" }}>
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
                              <div className="absolute left-0.5 right-0.5 z-30 pointer-events-none rounded-lg text-white text-[11px] px-1.5 py-1 ring-2 ring-white" style={{
                                top: ((moveDrag.start - gridMin) / 60) * HOUR_H + 1,
                                height: Math.max(22, (moveDrag.dur / 60) * HOUR_H) - 2,
                                background: moveDrag.color, opacity: 0.9,
                              }}>
                                <div className="font-semibold mono">{fromMin(moveDrag.start)}–{fromMin(moveDrag.start + moveDrag.dur)}</div>
                              </div>
                            )}
                            {/* [B-4] 승인 대기 요청 고스트 — 점선·반투명·클릭 불가(승인 시 실제 세션으로 대체) */}
                            {colGhosts.map((g) => {
                              const gs = toMin(g.startTime);
                              const ge = g.endTime ? toMin(g.endTime) : gs + g.durationMinutes;
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
                                <div className="h-px" style={{ background: "var(--color-danger)" }} />
                                <div
                                  className="absolute rounded-full"
                                  style={{ width: 8, height: 8, left: -4, top: -4, background: "var(--color-danger)" }}
                                />
                              </div>
                            )}
                            {colRows.map((r) => {
                              const s = sOf(r),
                                en = eOf(r);
                              const top = ((s - gridMin) / 60) * HOUR_H;
                              const h = Math.max(22, ((en - s) / 60) * HOUR_H);
                              const ln = lanes[r.id] ?? { lane: 0, lanes: 1 };
                              const wPct = 100 / ln.lanes;
                              return (
                                <div
                                  key={r.id}
                                  onPointerDown={(e) => onEventDown(e, r)}
                                  onClick={(e) => { e.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } setSelEvent(r.id); setSelBand(null); setDetailId(r.id); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); openEditor(r, colTz ? colTzc : null); }}
                                  title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"}${(r as TzShiftedRow).tzOverflowEnd ? ` · 자정 넘김(+1일 ~${(r as TzShiftedRow).tzOverflowEnd})` : ""}${r.memo ? " · " + r.memo : ""} — 클릭=선택 · 드래그=이동 · 더블클릭=상세`}
                                  className={`absolute rounded-lg text-white text-[11px] leading-tight px-1.5 py-1 cursor-grab overflow-hidden shadow-sm hover:brightness-105 transition ${selEvent === r.id ? "ring-2 ring-white" : "ring-1 ring-black/5"}`}
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
                                  {!colTz && selEvent === r.id && (
                                    <div onPointerDown={(e) => onResizeDown(e, r, "top", colTz ? colTzc.tz : null, gridMin, gridMax)} className="absolute left-1/2 -translate-x-1/2 top-0 w-6 h-2 rounded-b bg-white/90 cursor-ns-resize" />
                                  )}
                                  {/* 텍스트 3단계: full/title=가로 · vtitle=세로 글씨 · color=색상만 */}
                                  {(textMode === "full" || textMode === "title") && (
                                    <>
                                      <div
                                        className={`font-semibold truncate ${isCanceledStatus(r.status) ? "line-through opacity-90" : ""}`}
                                        style={textMode === "title" ? { fontSize: 10 } : undefined}
                                      >
                                        {labelOf(r)}{isCanceledStatus(r.status) ? ` (${STATUS_LABEL[r.status]})` : ""}
                                      </div>
                                      <div className="opacity-90 mono truncate" style={textMode === "title" ? { fontSize: 9.5 } : undefined}>
                                        {fromMin(s)}–{fromMin(en)}
                                        {(r as TzShiftedRow).tzOverflowEnd && (
                                          /* 자정 크로스 잔여(TBO-12 P0): 이 수업은 다음날 이 시각까지 이어짐 */
                                          <span className="ml-1 px-1 rounded bg-white/25 text-[9px] font-semibold not-italic">
                                            +1일 ~{(r as TzShiftedRow).tzOverflowEnd}
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
                                    <div
                                      className="font-semibold overflow-hidden"
                                      style={{ writingMode: "vertical-rl", fontSize: 9, lineHeight: 1.1, maxHeight: h - 6 }}
                                      title={`${labelOf(r)} ${fromMin(s)}–${fromMin(en)}${(r as TzShiftedRow).tzOverflowEnd ? ` (+1일 ~${(r as TzShiftedRow).tzOverflowEnd})` : ""}`}
                                    >
                                      {labelOf(r)}
                                    </div>
                                  )}
                                  {!colTz && selEvent === r.id && (
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

  return (
    <div className="p-6 max-w-[1560px] mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-semibold">스케줄 캘린더</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            드래그 이동 · Ctrl+드래그 복제 · Ctrl+C/V 복사·붙여넣기 · 빈 시간 클릭=커서 · {periodLabel}
            <span className="text-fg-subtle">
              {" "}
              · {inRange.length}건{anyFilter ? ` / 전체 ${rows.length}` : ""} · 시수 {hrs.hours}h
            </span>
            {selected && <span className="text-accent"> · {selected.name} 개인 스케줄</span>}
            {isSplit && (
              <span className="text-accent">
                {" "}· {twoPanes
                  ? `표 2개(강사 ${panes[0].picks.length} | 학생 ${panes[1].picks.length})`
                  : `데일리 스플릿(${splitDim === "instructor" ? "강사" : splitDim === "student" ? "학생" : "강의실"} ${singleSplitPicks.length})`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
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
          <button className="btn btn-sm" onClick={() => nav(-1)}>
            ◀
          </button>
          <button className="btn btn-sm" onClick={() => setAnchor(todayISO())}>
            오늘
          </button>
          <button className="btn btn-sm" onClick={() => nav(1)}>
            ▶
          </button>
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
          <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("png")} title="현재 화면을 PNG로 저장(시차 뷰면 그 국가 시간 기준)">
            PNG
          </button>
          <button className="btn btn-sm" disabled={busyImg} onClick={() => saveImage("jpeg")} title="현재 화면을 JPEG로 저장">
            JPEG
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* 좌측 추천 패널 제거(피드백 2026-07-02 #5) — 스플릿뷰로 강사·학생 스케줄을 직접 비교·배치. */}
        {/* 본문 */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* ── 뷰 프리셋 탭(TBO-12 P1): 필터·기간·국가 조합 저장/적용 — DB 자산(직원 공용) ── */}
          <CalendarViewTabs
            activeId={activePresetId}
            onApply={applyPreset}
            onSaveCurrent={saveCurrentPreset}
            onMsg={setMsg}
          />
          {/* ── Lantiv형 필터 바: 리소스 다중선택(스플릿) + 상태/그룹/기간 + 검색/색 기준 ── */}
          <CalendarFilterBar
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
            fStatuses={fStatuses}
            onToggleStatus={(s) =>
              setFStatuses((prev) => {
                const n = new Set(prev);
                if (n.has(s)) n.delete(s);
                else n.add(s);
                return n;
              })
            }
            fKinds={fKinds}
            onToggleKind={(k) =>
              setFKinds((prev) => {
                const n = new Set(prev);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            groupOnly={groupOnly}
            onGroupOnly={setGroupOnly}
            period={period}
            onPeriod={setPeriod}
            anyFilter={!!anyFilter}
            onClearAll={clearFilters}
          />
          {selected && selBlocks.length > 0 && (
            <p className="text-[12px] text-fg-subtle inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(26,127,55,.18)", borderLeft: "2px solid var(--color-success)" }} /> 가용
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, rgba(110,118,129,.18) 0 3px, rgba(110,118,129,.3) 3px 6px)" }} /> 불가
              </span>
              <span>밴드 클릭=선택 · 끝 드래그=시간 조절 · ✕=삭제</span>
            </p>
          )}

          {msg && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-[13px] text-white flex items-center gap-2"
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
            ) : twoPanes ? (
              /* 강사+학생 동시 필터 → 표 2개 자동(각 표 = 날짜×선택 데일리 스플릿). ✕=표 닫기(필터 유지) */
              <div className="flex gap-3 items-start overflow-x-auto pb-1">
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
                      <div className="flex items-center gap-1">
                        {/* [이슈3] 이 표의 날짜 범위 — 캘린더(from~to)로 표마다 다르게. 비우면 전역 기간. */}
                        <input type="date" className="input h-7 text-[11px] px-1 w-[122px]" title="이 표 시작일"
                          value={paneRange[g.dim]?.from ?? (dates[0] ?? "")}
                          onChange={(e) => setPaneRange((prev) => ({ ...prev, [g.dim]: { from: e.target.value, to: prev[g.dim]?.to ?? e.target.value } }))} />
                        <span className="text-[11px] text-fg-subtle">~</span>
                        <input type="date" className="input h-7 text-[11px] px-1 w-[122px]" title="이 표 종료일"
                          value={paneRange[g.dim]?.to ?? (dates[dates.length - 1] ?? "")}
                          min={paneRange[g.dim]?.from ?? dates[0]}
                          onChange={(e) => setPaneRange((prev) => ({ ...prev, [g.dim]: { from: prev[g.dim]?.from ?? (dates[0] ?? e.target.value), to: e.target.value } }))} />
                        {(paneRange[g.dim] || panePicked[g.dim]?.length) && (
                          <button type="button" className="btn btn-sm h-6 px-1 text-[11px]" title="전역 기간으로(범위·선택 날짜 해제)"
                            onClick={() => { setPaneRange((prev) => { const n = { ...prev }; delete n[g.dim]; return n; }); setPanePicked((prev) => { const n = { ...prev }; delete n[g.dim]; return n; }); }}>↺</button>
                        )}
                        {/* [B-3 #5] cherry-pick: 원하는 날짜만 여러 개 — 선택 시 범위(from~to)보다 우선 */}
                        <input type="date" className="input h-7 text-[11px] px-1 w-[122px]" title="날짜 추가(cherry-pick) — 고르면 그 날짜들만 표시"
                          value=""
                          onChange={(e) => { const d = e.target.value; if (!d) return; setPanePicked((prev) => { const cur = prev[g.dim] ?? []; if (cur.includes(d) || cur.length >= 14) return prev; return { ...prev, [g.dim]: [...cur, d].sort() }; }); }} />
                        {(panePicked[g.dim] ?? []).map((d) => (
                          <span key={d} className="badge text-[10px] mono cursor-pointer" title="클릭=이 날짜 제거"
                            onClick={() => setPanePicked((prev) => { const cur = (prev[g.dim] ?? []).filter((x) => x !== d); const n = { ...prev }; if (cur.length) n[g.dim] = cur; else delete n[g.dim]; return n; })}>
                            {d.slice(5)} ✕
                          </span>
                        ))}
                        <span className="w-px h-4" style={{ background: "var(--color-line)" }} />
                        {/* [B-2 #2] 표별 종류(kind) 필터 — 이 표에만 적용(전역 필터바와 별개·빈 선택=전체) */}
                        {KIND_FILTERS.map((k) => (
                          <button key={k} type="button" className={`btn btn-sm h-6 px-1.5 text-[10px] ${paneKinds[g.dim]?.has(k) ? "badge-accent" : ""}`}
                            title={`이 표에서 ${KIND_FILTER_LABEL[k]}만 (복수=합집합)`}
                            onClick={() => setPaneKinds((prev) => { const cur = new Set(prev[g.dim] ?? []); if (cur.has(k)) cur.delete(k); else cur.add(k); const n = { ...prev }; if (cur.size) n[g.dim] = cur; else delete n[g.dim]; return n; })}>
                            {KIND_FILTER_LABEL[k]}
                          </button>
                        ))}
                        <CountryInput
                          compact
                          value={paneTzOf(g.dim)}
                          onSelect={(c) => setPaneCountry((prev) => ({ ...prev, [g.dim]: c }))}
                          placeholder="🌐 국가"
                        />
                      </div>
                    }
                  >
                    {renderTimeGrid(colsFor(g.picks, `p${g.dim}|`, paneDatesOf(g.dim)), paneTzOf(g.dim), paneKinds[g.dim])}
                  </CalendarSplitPane>
                ))}
              </div>
            ) : (
              renderTimeGrid(columns, country)
            )}
          </div>
          {isGrid && selected?.type === "instructor" && (
            <p className="text-[12px] text-fg-subtle">
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
            //  종료가 KST에서 다음날로 넘어가면 자정 크로스 — 백엔드가 거부(무결성)하므로 그대로 전달.
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
          label={`${blockScope.kind === "unavailable" ? "불가시간" : "가용시간"} 변경`}
          onPick={applyBlockScope}
          onCancel={() => { setBlockScope(null); reloadSelBlocks(); }}
        />
      )}

      {blockDelScope && (
        <RecurrencePrompt
          label={`${blockDelScope.kind === "unavailable" ? "불가시간" : "가용시간"} 삭제`}
          onPick={applyBlockDeleteScope}
          onCancel={() => setBlockDelScope(null)}
        />
      )}
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
  const [kind, setKind] = useState<"available" | "unavailable">(block.kind);
  const [weekday, setWeekday] = useState<number>(block.weekday);
  const [start, setStart] = useState(block.startTime);
  const [end, setEnd] = useState(block.endTime);
  const [from, setFrom] = useState(block.effectiveFrom ?? "");
  const [to, setTo] = useState(block.effectiveTo ?? "");
  const periodOk = !from || !to || from <= to;
  const valid = start < end && periodOk;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[380px] max-w-[95vw] max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{kind === "unavailable" ? "불가시간" : "가용시간"} 수정</div>
        <Field label="종류">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="unavailable">불가(차단)</option>
            <option value="available">가용</option>
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
        <p className="text-[12px] text-fg-muted">매주 {WD[weekday]}요일 반복. 기간을 비우면 무기한, 지정하면 그 기간에만 적용.</p>
        {!periodOk && <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>기간 시작이 종료보다 늦을 수 없습니다.</p>}
        <div className="flex justify-between gap-2 pt-1">
          <button className="btn btn-sm" style={{ color: "var(--color-danger)" }} onClick={onDelete}>삭제</button>
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
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--color-line)" }}>
        {WD.map((w, i) => (
          <div
            key={w}
            className={`px-3 py-2 text-[12px] font-semibold ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-fg-muted"}`}
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
                className={`text-[12px] mb-1 px-1 rounded hover:bg-canvas-subtle ${date === todayISO() ? "font-bold text-accent" : "text-fg-subtle"}`}
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
                  className="block w-full text-left rounded px-1.5 py-0.5 text-[11px] text-white truncate"
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
                <button className="text-[11px] text-fg-muted hover:underline px-1" onClick={() => onPickDay(date)}>
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[440px] max-w-[95vw] max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <span className="inline-block w-3 h-3 rounded-sm mt-1.5 shrink-0" style={{ background: colorOf(row) }} />
          <div className="flex-1">
            <div className="font-semibold">{row.courseName}</div>
            <div className="text-fg-subtle text-[12px]">
              {row.subjectName} · {row.instructorName}
              {row.studentNames?.length ? ` · ${row.studentNames.join(", ")}` : ""}
            </div>
          </div>
          {isSeries && <span className="badge badge-accent">반복</span>}
        </div>

        {mode === "detail" ? (
          <>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1.5 text-[13px]">
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
              <p className="text-[12px] px-1" style={{ color: "var(--color-accent)" }}>
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
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onCancel}>
      <div className="card card-pad w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">반복 일정 수정</div>
        <p className="text-[13px] text-fg-muted">{label} — 어디까지 적용할까요?</p>
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
    <div className="border rounded-md overflow-hidden" style={{ borderColor: "var(--color-line)" }}>
      <input className="input h-8 w-full text-[12px] rounded-none border-0 border-b" style={{ borderColor: "var(--color-line)" }}
        placeholder={placeholder ?? "검색"} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[168px] overflow-y-auto p-1 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-fg-subtle text-center py-3">검색 결과 없음</p>
        ) : filtered.map((it) => {
          const on = selected.has(it.id);
          return (
            <label key={it.id} className={`flex items-center gap-2 px-2 h-7 rounded cursor-pointer text-[12px] ${on ? "badge-accent" : "hover:bg-canvas-subtle"}`}>
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
  const dur = toMin(end) - toMin(start);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작"><TimeSelect value={start} onChange={onStart} /></Field>
        <Field label={`종료${endHint ? ` (${endHint})` : ""}`}><TimeSelect value={end} onChange={onEnd} /></Field>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-[11px] text-fg-subtle self-center mr-0.5">빠른 선택</span>
        {DUR_PRESETS.map((m) => (
          <button key={m} type="button" onClick={() => onEnd(fromMin(toMin(start) + m))}
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
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
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
                className={`w-8 h-8 rounded text-[12px] border ${customWds.includes(d) ? "badge-accent" : ""}`}
                style={{ borderColor: "var(--color-line)" }}>{w}</button>
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
  defaultDate: string;
  defaultStart?: string; // 빈 곳 더블클릭 시 그 시각으로 프리필
  lockInstructorId?: number; // 강사 본인만 추가 가능할 때 — 본인 ID로 고정
  defaultInstructorId?: number; // 유저별 추가(스플릿 강사 컬럼) — 프리필(변경 가능)
  defaultOwner?: ScheduleResource | null;
  ownerTz?: CountryInfo | null; // [이슈1] 비KST 컬럼 추가 — 입력은 현지 시각, 저장 시 KST 역변환
  onClose: () => void;
  onCreate: (body: ScheduleCreateBody) => void;
  onCreateSeries: (bodies: ScheduleCreateBody[]) => void;
  onCreateBlock: (body: AvailabilityUpsertBody) => void;
}) {
  // [이슈1] 현지 tz의 (date, HH:mm) → KST 저장값. KST면 그대로. 저장은 항상 KST 단일 진실원.
  const tzActive = !!ownerTz && ownerTz.tz !== KST_TZ;
  const toKst = (dLocal: string, t: string) => (tzActive ? tzLocalToKst(dLocal, t, ownerTz!.tz) : { date: dLocal, time: t });
  // 유형: 수업 / 가용 / 불가 — 셋 다 같은 날짜·시간·반복(그날만=일회성 / 매주 / 커스텀) UX.
  const [type, setType] = useState<"session" | "available" | "unavailable">("session");

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
  const [end, setEnd] = useState(fromMin(toMin(defaultStart ?? "16:00") + (myCourses[0]?.durationMinutes ?? 90)));
  const [memo, setMemo] = useState("");
  // [v0.1.14] 종류(수업/진단고사/상담 — 캘린더 필터 축) + 상담 등 단건 가격(Q1: 담당자=강사 재사용)
  const [kind, setKind] = useState<"class" | "level_test" | "counsel">("class");
  const [price, setPrice] = useState("");
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
      setEnd(fromMin(toMin(start) + c.durationMinutes)); // 코스 진행시간으로 종료 자동
      setColor(c.color); // 코스 색을 기본 색으로
    }
  }
  function changeStart(v: string) {
    setStart(v);
    if (type === "session") setEnd(fromMin(toMin(v) + courseDur)); // 수업만 코스 진행시간으로 종료 자동
  }
  const sessionValid = courseId && date && start < end;

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
  function submitBlocks() {
    const kind = type === "unavailable" ? "unavailable" : "available";
    // [이슈1] 비KST 입력: 현지 (date,시각)을 KST로 변환 후 요일·시각 확정. 반복은 KST 시각·요일 기준.
    if (repeat === "none") {
      const ks = toKst(date, start), ke = toKst(date, end);
      onCreateBlock({ ownerType: bType, ownerId: Number(bId), kind, startTime: ks.time, endTime: ke.time, weekday: weekdayOf(ks.date), effectiveFrom: ks.date, effectiveTo: ks.date });
    } else {
      const ks = toKst(date, start), ke = toKst(date, end);
      const base = { ownerType: bType, ownerId: Number(bId), kind, startTime: ks.time, endTime: ke.time } as const;
      // 변환으로 요일이 밀리면 그만큼 보정(현지 요일 → KST 요일 델타)
      const wdShift = tzActive ? (weekdayOf(ks.date) - weekdayOf(date) + 7) % 7 : 0;
      const wds = repeat === "weekly" ? [weekdayOf(date)] : customWds;
      wds.forEach((wd) => onCreateBlock({ ...base, weekday: (wd + wdShift) % 7, effectiveFrom: ks.date, effectiveTo: untilDate }));
    }
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
        kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined };
    };
    const days = occurrences();
    if (days.length <= 1) onCreate(mk(days[0] ?? date));
    else onCreateSeries(days.map(mk));
  }

  return (
    // TBO-09 #4: 모달이 화면보다 커져 "추가" 버튼이 가려지는 문제 — 최대 크기 명시 + 본문만 스크롤 + 푸터 고정.
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div
        className="card w-[460px] max-w-[95vw] flex flex-col overflow-hidden"
        style={{ maxHeight: "min(85vh, 720px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-pad overflow-y-auto space-y-3 flex-1 min-h-0">
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
          {([["session", "수업"], ["available", "가용"], ["unavailable", "불가"]] as const).map(([v, lbl]) => (
            <button key={v} className={`btn btn-sm flex-1 rounded-none border-0 ${type === v ? "badge-accent" : ""}`} onClick={() => setType(v)}>{lbl}</button>
          ))}
        </div>
        {tzActive && (
          <p className="text-[12px] px-0.5" style={{ color: "var(--color-accent)" }}>
            🌐 {ownerTz!.name} 현지 시각으로 입력하세요 — 저장은 한국 시간(KST)으로 변환됩니다.
          </p>
        )}

        {type === "session" ? (
          <>
            {lockedInstructorName && <div className="text-[12px] text-fg-muted">{lockedInstructorName} (내 수업)</div>}
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
                <p className="text-[12px] text-fg-subtle">이 코스의 활성 수강생이 없습니다 — 수강 등록 후 선택 가능</p>
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
              <Field label="색상"><ColorPicker value={color} onChange={setColor} /></Field>
            </div>
            <Field label="메모"><textarea className="input min-h-[52px] py-1.5" rows={2} placeholder="선택 — 메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <RepeatField repeat={repeat} setRepeat={setRepeat} customWds={customWds} toggleWd={toggleWd}
              untilDate={untilDate} setUntilDate={setUntilDate} date={date} occurrencesCount={occurrences().length} noneLabel="그날만" />
          </>
        ) : (
          <>
            {lockedInstructorName && <div className="text-[12px] text-fg-muted">{lockedInstructorName} (본인)</div>}
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
            <p className="text-[12px] text-fg-muted">{repeat === "none" ? "일회성 — 이 날짜에 한 번만 적용." : "매주 반복 — 이 날짜부터 종료일까지."}</p>
          </>
        )}
        </div>
        {/* 고정 푸터 — 스크롤과 무관하게 추가/취소 버튼 항상 노출 */}
        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0" style={{ borderColor: "var(--color-line)" }}>
          <button className="btn" onClick={onClose}>취소</button>
          {type === "session" ? (
            <button className="btn btn-primary" disabled={!sessionValid || (repeat !== "none" && occurrences().length === 0)} onClick={submitSession}>
              {repeat === "none" ? "수업 추가" : `반복 추가 (${occurrences().length}회)`}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!blockValid} onClick={submitBlocks}>
              {type === "unavailable" ? "불가시간" : "가용시간"} 추가
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
