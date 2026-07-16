// [TBO-29C C4.5] 스케줄/블록 생성 모달 — ScheduleCalendar(~3,700줄)에서 분리(관리 용이성).
//  수업(단건/반복 bulk command)·가용/불가/온라인만 블록의 생성 UX와 KST 정규화 규칙을 소유한다.
//  반복 규칙은 lib/domain/series.seriesRuleToKst — 서버(POST /schedule/series)가 날짜를 재계산·발급.
"use client";

import { useCallback, useMemo, useState } from "react";
import type { AvailabilityUpsertBody, ScheduleCreateBody, ScheduleSeriesCreateBody } from "@/lib/api";
import type { Room, ScheduleResource, ScheduleResources } from "@/types";
// [B6 C1 2026-07-16] 사설 fixed div → ModalShell 이관(focus trap/Escape/aria 통일 — E1)
import { Field, ModalShell } from "@/components/ui";
import { ColorPicker, TimeSelect } from "./SessionEditFields";
import { STATUS_LABEL } from "@/lib/domain/lantiv";
import { AVAILABILITY_KIND_LABEL } from "@/lib/domain/approvals";

const isCanceledStatus = (s?: string) => s === "canceled" || s === "no_show";
import { useAllAvailability, useEnrollments, useStudents } from "@/lib/queries";
// [B4 2026-07-16 대표 결정 ②] 강의실 관리 — 수업탭(CoursesView)과 같은 공용 컴포넌트 재사용(사설 사본 금지)
import { RoomManagerPanel } from "@/features/rooms/RoomManagerPanel";
import { weekdayOf, toMin, fromMin, durationMinutesBetween, WEEKDAYS_KO as WD, ownerAvailabilityForSlot } from "@/lib/domain/schedule";
import { seriesRuleToKst } from "@/lib/domain/series";
import { splitKstBand, tzLocalToKst, KST_TZ, type CountryInfo } from "@/lib/domain/tz";

const DUR_PRESETS = [30, 60, 90, 120, 150, 180] as const;
const durLabel = (m: number) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? "30분" : ""}`);

const addDaysISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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
export function ScheduleCreateModal({
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
  onCreateSeriesCommand,
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
  onCreateSeries: (bodies: ScheduleCreateBody[]) => void; // 강사 — 회차별 승인 요청
  onCreateSeriesCommand: (body: ScheduleSeriesCreateBody, previews: ScheduleCreateBody[]) => void; // 관리자 — bulk 원자 생성
  // [B6 C1] {ok, message?} — 실패 사유를 모달 안 인라인 에러로 표시(window.alert 폐지). 승인 전환 시 message 없음.
  onCreateBlock: (body: AvailabilityUpsertBody, options?: { closeOnSuccess?: boolean }) => Promise<{ ok: boolean; message?: string }>;
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
  // [B4] 강의실 관리 패널 토글(매니저 이상) — 모달 안 인라인 렌더(새 모달 중첩 금지, DESIGN §5)
  const [showRoomManager, setShowRoomManager] = useState(false);
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
  const { data: blocks = [] } = useAllAvailability();
  const instAvailability = useCallback((id: number) => {
    const s = toMin(start);
    const e = end < start ? 1440 : toMin(end);
    return ownerAvailabilityForSlot(
      blocks,
      { type: "instructor", id },
      { weekday: weekdayOf(date), start: s, end: e, mode: sessionMode },
      { requireAvailable: true },
    );
  }, [blocks, date, start, end, sessionMode]);
  const instAvailable = useCallback((id: number): boolean => instAvailability(id).available, [instAvailability]);
  const instAvailabilityLabel = useCallback((id: number): string => {
    const decision = instAvailability(id);
    if (decision.available) return "가용";
    if (decision.reason === "online_only_overlap") return "온라인만 가능";
    if (decision.reason === "unavailable_overlap") return "불가";
    return "가용 외";
  }, [instAvailability]);
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
  const [pickedStudentState, setPickedStudentState] = useState<{ courseId: number; ids: Set<number> | null } | null>(null);
  const pickedStudents = pickedStudentState?.courseId === courseId ? pickedStudentState.ids : null;
  const setPickedStudents = (ids: Set<number> | null) => setPickedStudentState({ courseId, ids });
  const effPicked = pickedStudents ?? new Set(courseRoster.map((r) => r.id));

  // ── 가용/불가 대상(오너) — 시간·날짜·반복은 수업과 공유 ──
  const lockOwner = lockInstructorId != null;
  const [bType, setBType] = useState<"instructor" | "student" | "room">(lockOwner ? "instructor" : (defaultOwner?.type ?? "instructor"));
  const [bId, setBId] = useState<number | "">(lockOwner ? lockInstructorId! : (defaultOwner?.id ?? ""));
  const ownerList = bType === "instructor" ? resources.instructors : bType === "student" ? resources.students : rooms.map((r) => ({ id: r.id, name: r.name }));
  const blockValid = bId !== "" && start < end && (repeat !== "custom" || customWds.length > 0);
  // [B6 C1] 블록 저장 실패 인라인 에러(구 window.alert 대체) — 모달이 열린 채 실패 사유를 보여준다.
  const [blockError, setBlockError] = useState<string | null>(null);
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
    setBlockError(null);
    for (const body of bodies) {
      const res = await onCreateBlock(body, { closeOnSuccess: false });
      if (!res.ok) { if (res.message) setBlockError(res.message); return; } // 승인 전환(message 없음)은 조용히 유지
    }
    onClose();
  }
  function submitSession() {
    // [TBO-29C C2] 클라이언트 seriesId(Date.now()) 폐기 — 시리즈 ID·규칙은 서버가 발급/자산화.
    // 부분 선택 시에만 명시 코호트 전송(전원=미전송 — 코스 파생과 동일·하위 호환)
    const studentIds =
      pickedStudents != null && effPicked.size !== courseRoster.length ? [...effPicked] : undefined;
    // [이슈1] 각 발생일(현지)을 KST로 변환해 저장 — 종료는 시작과 같은 현지날짜 기준으로 변환.
    const mk = (dLocal: string): ScheduleCreateBody => {
      const ks = toKst(dLocal, start), ke = toKst(dLocal, end);
      return { courseId, instructorId: lockInstructorId ?? (instructorId || undefined), roomId: roomId || undefined, sessionDate: ks.date, startTime: ks.time, endTime: ke.time, durationMinutes: durationMinutesBetween(start, end), memo: memo || undefined, color, status, studentIds,
        kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined, mode: sessionMode }; // [C2D] 강사 요청도 mode 보존
    };
    const days = occurrences();
    if (days.length <= 1) { onCreate(mk(days[0] ?? date)); return; }
    if (requestMode) { onCreateSeries(days.map(mk)); return; } // 강사 — 회차별 승인 요청(C3에서 bulk 요청 통합 검토)
    // 관리자 — KST 정규화 규칙만 전송(occurrence 날짜는 서버가 재계산·발급)
    const rule = seriesRuleToKst({ date, untilDate, repeat: repeat === "none" ? "weekly" : repeat, customWds, toKst, start, end });
    onCreateSeriesCommand({
      courseId, instructorId: lockInstructorId ?? (instructorId || undefined), roomId: roomId || undefined, studentIds,
      repeat: { kind: repeat === "weekly" ? "weekly" : "custom", weekdays: rule.weekdays, startsOn: rule.startsOn, endsOn: rule.endsOn },
      startTime: rule.startTime, endTime: rule.endTime,
      memo: memo || undefined, color, status,
      kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined, mode: sessionMode,
    }, days.map(mk));
  }

  return (
    // TBO-09 #4(모달이 화면보다 커져 버튼 가려짐)는 ModalShell이 담당 — 본문만 스크롤 + 푸터 고정.
    <ModalShell
      title="스케줄 추가"
      onClose={onClose}
      size="md"
      bodyClassName="space-y-3"
      footer={(
        <>
          {blockError && <span className="text-caption text-danger mr-auto self-center" role="alert">{blockError}</span>}
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
        </>
      )}
    >
        <div className="flex rounded-md overflow-hidden border">
          {([["session", "수업"], ["available", "가용"], ["unavailable", "불가"], ["online_only", "온라인만"]] as const).map(([v, lbl]) => (
            <button key={v} className={`btn btn-sm flex-1 rounded-none border-0 ${type === v ? "badge-accent" : ""}`} onClick={() => { setType(v); setBlockError(null); }}>{lbl}</button>
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
            <Field label={`강사 ${instructorId && !instAvailable(Number(instructorId)) ? `· ⚠ ${instAvailabilityLabel(Number(instructorId))}` : ""}`}>
              {lockInstructorId == null ? (
                <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value ? Number(e.target.value) : "")}>
                  {sortedInstructors.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} · {instAvailabilityLabel(i.id)}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={lockedInstructorName ?? "본인"} disabled readOnly />
              )}
            </Field>
            <Field label="강의실">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select className="input flex-1" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">미지정</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {/* [B4] 강의실 관리 토글 — 매니저 이상만(강사 요청 모드 제외). 펼치면 공용 패널을
                      모달 안 인라인으로 렌더(새 모달 중첩 금지, DESIGN §5). 생성/수정 성공 시
                      qk.rooms invalidate → 위 select 옵션 자동 갱신. */}
                  {!requestMode && (
                    <button type="button" onClick={() => setShowRoomManager((v) => !v)}
                      className={`btn btn-sm shrink-0 ${showRoomManager ? "badge-accent" : ""}`}>
                      강의실 관리
                    </button>
                  )}
                </div>
                {!requestMode && showRoomManager && (
                  <div className="border rounded-md bg-canvas-subtle">
                    <RoomManagerPanel compact />
                  </div>
                )}
              </div>
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
              {/* [C2D] 강사 요청 모드에서도 수업방식 노출 — 요청→승인까지 mode 보존 */}
              <Field label="수업방식">
                <select className="input" value={sessionMode} onChange={(e) => setSessionMode(e.target.value as typeof sessionMode)}>
                  <option value="in_person">대면</option>
                  <option value="online">비대면</option>
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
    </ModalShell>
  );
}
