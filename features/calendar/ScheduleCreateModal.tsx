// [TBO-29C C4.5] 스케줄/블록 생성 모달 — ScheduleCalendar(~3,700줄)에서 분리(관리 용이성).
//  수업(단건/반복 bulk command)·가용/불가/온라인만 블록의 생성 UX와 KST 정규화 규칙을 소유한다.
//  반복 규칙은 lib/domain/series.seriesRuleToKst — 서버(POST /schedule/series)가 날짜를 재계산·발급.
"use client";

import { useCallback, useMemo, useState } from "react";
import { addDaysISO } from "@/lib/format"; // [TBO-69 C4]
import type { AvailabilityUpsertBody, ScheduleCreateBody, ScheduleSeriesCreateBody } from "@/lib/api";
import type { Room, ScheduleResource, ScheduleResources } from "@/types";
import type { CreateHistoricalCompletedSessionInput, SessionStatus } from "@kms545487/contracts";
import { courseRosterFromScheduleResources, explicitCohortForSubmit, pruneStudentSelection, scheduleResourceName, studentPickerItemsFromScheduleResources } from "@/lib/domain/schedule-resources";
// [B6 C1 2026-07-16] 사설 fixed div → ModalShell 이관(focus trap/Escape/aria 통일 — E1)
import { Field, ModalShell, SearchableCheckList } from "@/components/ui";
import { InlineCreateField } from "@/components/InlineCreateField";
import { ColorPicker } from "./SessionEditFields";
import { MANUAL_SESSION_STATUSES, STATUS_LABEL } from "@/lib/domain/lantiv";
import { AVAILABILITY_KIND_LABEL } from "@/lib/domain/approvals";

const isCanceledStatus = (s?: string) => s === "canceled" || s === "no_show";
import { useAllAvailability, useCreateEnrollment } from "@/lib/queries";
import { apiErrorMessage } from "@/lib/api-error";
import { CourseCreateForm, SubjectCreateForm } from "@/features/admin/catalog/CatalogCreateForms";
import { InstructorCreateForm } from "@/features/admin/instructors/InstructorCreateForm";
import { RoomCreateForm } from "@/features/rooms/RoomCreateForm";
import { StudentRegistrationForm } from "@/features/students/StudentRegistrationForm";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { weekdayOf, toMin, fromMin, durationMinutesBetween, ownerAvailabilityForSlot } from "@/lib/domain/schedule";
import { seriesRuleToKst } from "@/lib/domain/series";
import { splitKstBand, tzLocalToKst, KST_TZ, type CountryInfo } from "@/lib/domain/tz";
import { ScheduleDateField } from "./inputs/ScheduleDateField";
import { ScheduleEntryTypeSelector } from "./inputs/ScheduleEntryTypeSelector";
import { availabilityKindOf, type ScheduleEntryType } from "@/lib/domain/schedule-entry-kind";
import { ScheduleRepeatFields, type ScheduleRepeat } from "./inputs/ScheduleRepeatFields";
import { ScheduleTimeRangeFields } from "./inputs/ScheduleTimeRangeFields";
import { historicalCompletedInput, historicalSessionEnded } from "@/lib/domain/historical-session";

// [TBO-69 C4] addDaysISO — lib/format 정본 소비(사본 제거)
// ── 관리자: 스케줄 추가 모달 ──
export function ScheduleCreateModal({
  resources,
  rooms,
  requestMode, // [UX H1] 강사=승인 요청 모드 — 버튼·안내 문구를 실제 동작과 일치
  defaultDate,
  defaultStart,
  defaultEnd,
  lockInstructorId,
  defaultInstructorId,
  defaultOwner,
  ownerTz,
  onClose,
  onCreate,
  onCreateHistorical,
  onCreateSeries,
  onCreateSeriesCommand,
  onCreateBlock,
}: {
  resources: ScheduleResources;
  rooms: Room[];
  requestMode?: boolean; // 강사(비관리자) — 수업 탭 제출이 승인 요청으로 전송됨
  defaultDate: string;
  defaultStart?: string; // 빈 곳 더블클릭 시 그 시각으로 프리필
  defaultEnd?: string; // 빈 시간 범위 drag 시 선택한 종료 시각으로 프리필
  lockInstructorId?: number; // 강사 본인만 추가 가능할 때 — 본인 ID로 고정
  defaultInstructorId?: number; // 유저별 추가(스플릿 강사 컬럼) — 프리필(변경 가능)
  defaultOwner?: ScheduleResource | null;
  ownerTz?: CountryInfo | null; // [이슈1] 비KST 컬럼 추가 — 입력은 현지 시각, 저장 시 KST 역변환
  onClose: () => void;
  onCreate: (body: ScheduleCreateBody) => void;
  onCreateHistorical: (body: CreateHistoricalCompletedSessionInput) => void;
  onCreateSeries: (bodies: ScheduleCreateBody[]) => void; // 강사 — 회차별 승인 요청
  onCreateSeriesCommand: (body: ScheduleSeriesCreateBody, previews: ScheduleCreateBody[]) => void; // 관리자 — bulk 원자 생성
  // [B6 C1] {ok, message?} — 실패 사유를 모달 안 인라인 에러로 표시(window.alert 폐지). 승인 전환 시 message 없음.
  onCreateBlock: (body: AvailabilityUpsertBody, options?: { closeOnSuccess?: boolean }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const access = useAccountAccess();
  // [이슈1] 현지 tz의 (date, HH:mm) → KST 저장값. KST면 그대로. 저장은 항상 KST 단일 진실원.
  const tzActive = !!ownerTz && ownerTz.tz !== KST_TZ;
  const toKst = (dLocal: string, t: string) => (tzActive ? tzLocalToKst(dLocal, t, ownerTz!.tz) : { date: dLocal, time: t });
  // 유형: 수업 / 가용 / 불가 — 셋 다 같은 날짜·시간·반복(그날만=일회성 / 매주 / 커스텀) UX.
  const [type, setType] = useState<ScheduleEntryType>("session");

  // ── 수업 탭 ──
  const myCourses = lockInstructorId != null ? resources.courses.filter((c) => c.instructorId === lockInstructorId) : resources.courses;
  const [courseId, setCourseId] = useState<number>(myCourses[0]?.id ?? 0);
  const course = resources.courses.find((c) => c.id === courseId);
  type InstructorSelection = number | "unassigned" | "";
  const initialInstructor: InstructorSelection = lockInstructorId
    ?? defaultInstructorId
    ?? (course ? (course.instructorId ?? "unassigned") : "");
  const [instructorId, setInstructorId] = useState<InstructorSelection>(initialInstructor);
  const [roomId, setRoomId] = useState<number | "">("");
  type InlineCreator = "course" | "instructor" | "room" | "student";
  const [inlineCreator, setInlineCreator] = useState<InlineCreator | null>(null);
  const [inlineSubjectId, setInlineSubjectId] = useState<number | undefined>();
  const toggleInlineCreator = (creator: InlineCreator) => setInlineCreator((current) => current === creator ? null : creator);
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState(defaultStart ?? "16:00");
  // 진행시간은 코스(실제 수업) 데이터에서 — 종료시각 자동 계산(편집 가능)
  const courseDur = course?.durationMinutes ?? 90;
  // [R-9] 심야 시작(예: 23:30) + 진행시간이 자정을 넘으면 %1440 래핑('25:00' 금지) — end<start는
  //  익일 종료(자정 크로스)로 저장된다(아래 crossesMidnight 안내·BE 해석 규칙).
  const [end, setEnd] = useState(defaultEnd ?? fromMin((toMin(defaultStart ?? "16:00") + (myCourses[0]?.durationMinutes ?? 90)) % 1440));
  const [memo, setMemo] = useState("");
  // [v0.1.14] 종류(수업/진단고사/상담 — 캘린더 필터 축) + 상담 등 단건 가격(Q1: 담당자=강사 재사용)
  const [kind, setKind] = useState<"class" | "level_test" | "counsel">("class");
  const [price, setPrice] = useState("");
  const [sessionMode, setSessionMode] = useState<"in_person" | "online">("in_person");
  const [isPublic, setIsPublic] = useState(false);
  // 색상 라벨: 생성 시 기본값은 개설 때 고른 코스 색(미지정 시 비움 → 백엔드가 코스/과목 색 폴백)
  const [color, setColor] = useState<string | undefined>(myCourses[0]?.color);
  const [status, setStatus] = useState<SessionStatus>("scheduled");
  const [historicalImport, setHistoricalImport] = useState(false);
  const [importReason, setImportReason] = useState("");
  // ── 반복(그날만/매주/커스텀) + 종료일 ──
  const [repeat, setRepeat] = useState<ScheduleRepeat>("none");
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
      if (lockInstructorId == null) setInstructorId(c.instructorId ?? "unassigned");
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
  const historicalKstStart = toKst(date, start);
  const historicalImportEnded = historicalSessionEnded({
    sessionDate: historicalKstStart.date,
    startTime: historicalKstStart.time,
    durationMinutes: durationMinutesBetween(start, end),
  });
  const historicalImportEligible = historicalImportEnded && repeat === "none" && kind !== "counsel";
  const historicalImportVisible = !requestMode && (historicalImportEligible || historicalImport);

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

  // ── [TBO-86I Grace ver.2 2.2] 학생 선택 = 재원생 전체 단일 검색 리스트(수강생 먼저).
  //  미수강생을 숨김 패널로 빼지 않는다 — 같은 리스트에서 검색·선택하면 서버 enrollment 생성(자동
  //  연결) 뒤 코호트에 들어간다. 강사 요청 모드는 연결 권한이 없으므로 본인 코스 roster만 노출한다.
  //  수강생 산출은 `/schedule/resources` course.studentIds 한 곳을 사용한다. 강사 모달에서
  //  전역 /enrollments·/students cache를 읽지 않아 계정 전환 시 타 강사 roster가 섞이지 않는다.
  const courseRoster = useMemo(
    () => courseRosterFromScheduleResources(resources, courseId),
    [resources, courseId],
  );
  const studentPickerItems = useMemo(
    () =>
      requestMode
        ? courseRosterFromScheduleResources(resources, courseId).map((student) => ({ ...student, enrolled: true }))
        : studentPickerItemsFromScheduleResources(resources, courseId),
    [requestMode, resources, courseId],
  );
  // [TBO-86I-3] 기본은 아무도 선택 안 됨(운영 지시 — 구 전원 자동 체크 폐지). 학생 컬럼/카드에서 연
  //  경우만 그 학생 1명 프리필. 선택 상태는 화면에 보이는 재원생으로만 파생(prune — 원부 삭제·퇴원·
  //  과목 전환 시 유령 선택/카운트 자동 정리, 등록 직후 refetch 도착 시 자동 복원되는 비파괴 파생).
  const [pickedStudentState, setPickedStudentState] = useState<{ courseId: number; ids: Set<number> } | null>(null);
  const pickedStudents = pickedStudentState?.courseId === courseId ? pickedStudentState.ids : null;
  const setPickedStudents = (ids: Set<number>) => setPickedStudentState({ courseId, ids });
  const seedStudentId = defaultOwner?.type === "student" ? Number(defaultOwner.id) : undefined;
  const rawPicked = pickedStudents ?? (seedStudentId != null ? new Set([seedStudentId]) : new Set<number>());
  const effPicked = pruneStudentSelection(rawPicked, studentPickerItems);
  const createEnrollment = useCreateEnrollment();
  const [studentLinkMessage, setStudentLinkMessage] = useState("");

  function linkStudent(studentId: number) {
    setStudentLinkMessage("");
    createEnrollment.mutate({ studentId, courseId }, {
      // [TBO-87D owner 지시] 성공은 조용히(체크만) — "미수강/자동 연결" 안내·성공 문구 제거.
      //  실패만 인라인 표면화(조용한 실패는 체크가 안 되는 유령 상태로 보이므로 유지).
      onSuccess: () => setPickedStudents(new Set([...effPicked, studentId])),
      onError: (error) => setStudentLinkMessage(apiErrorMessage(error, "학생을 이 수업에 넣지 못했습니다.")),
    });
  }

  function toggleStudentPick(studentId: number) {
    const item = studentPickerItems.find((candidate) => candidate.id === studentId);
    // 미수강 + 미선택 → 자동 연결(성공 시 onSuccess에서 체크). 그 외에는 일반 코호트 토글.
    if (item && !item.enrolled && !effPicked.has(studentId)) { linkStudent(studentId); return; }
    const next = new Set(effPicked);
    if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
    setPickedStudents(next);
  }
  // [TBO-86I-3] 수업은 학생 1명 이상 필수 — 빈 선택을 서버에 보내면 roster 파생(전원) 규칙과
  //  화면(아무도 선택 안 됨)이 어긋나므로 제출 자체를 막는다.
  const cohortValid = effPicked.size > 0;

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
    if (type === "session") return;
    const kind = availabilityKindOf(type);
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
    // [TBO-86I-3] 직렬화 단일 규칙: 체크 집합이 수강생 전원과 정확히 일치할 때만 미전송(서버
    //  파생 — 시리즈가 이후 수강 변동을 따라가는 하위 호환), 그 외에는 명시 코호트 전송.
    const studentIds = explicitCohortForSubmit(effPicked, courseRoster);
    // [이슈1] 각 발생일(현지)을 KST로 변환해 저장 — 종료는 시작과 같은 현지날짜 기준으로 변환.
    const selectedInstructorId = lockInstructorId
      ?? (instructorId === "unassigned" ? null : (instructorId || undefined));
    const mk = (dLocal: string): ScheduleCreateBody => {
      const ks = toKst(dLocal, start), ke = toKst(dLocal, end);
      return { courseId, instructorId: selectedInstructorId, roomId: roomId || undefined, sessionDate: ks.date, startTime: ks.time, endTime: ke.time, durationMinutes: durationMinutesBetween(start, end), memo: memo || undefined, color, studentIds,
        kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined, mode: sessionMode,
        ...(!requestMode ? { status, isPublic } : {}) }; // 상태·공개 여부는 관리자 확정 일정에만 적용
    };
    const days = occurrences();
    if (days.length <= 1) {
      const single = mk(days[0] ?? date);
      if (historicalImport) {
        const pickedInstructorId = selectedInstructorId;
        if (!historicalImportEligible || !historicalSessionEnded(single)) {
          setBlockError("종료된 과거 수업만 완료 상태로 이관할 수 있습니다.");
          return;
        }
        if (!pickedInstructorId || effPicked.size === 0) {
          setBlockError("완료 이관에는 담당 강사와 학생을 한 명 이상 선택해야 합니다.");
          return;
        }
        if (importReason.trim().length < 5) {
          setBlockError("이관 사유를 5자 이상 입력해 주세요.");
          return;
        }
        onCreateHistorical(historicalCompletedInput(single, {
          instructorId: Number(pickedInstructorId),
          studentIds: [...effPicked],
          importReason,
        }));
        return;
      }
      onCreate(single);
      return;
    }
    if (requestMode) { onCreateSeries(days.map(mk)); return; } // 강사 — 회차별 승인 요청(C3에서 bulk 요청 통합 검토)
    // 관리자 — KST 정규화 규칙만 전송(occurrence 날짜는 서버가 재계산·발급)
    const rule = seriesRuleToKst({ date, untilDate, repeat: repeat === "none" ? "weekly" : repeat, customWds, toKst, start, end });
    onCreateSeriesCommand({
      courseId, instructorId: selectedInstructorId, roomId: roomId || undefined, studentIds,
      repeat: { kind: repeat === "weekly" ? "weekly" : "custom", weekdays: rule.weekdays, startsOn: rule.startsOn, endsOn: rule.endsOn },
      startTime: rule.startTime, endTime: rule.endTime,
      memo: memo || undefined, color, status,
      kind: kind === "class" ? undefined : kind, price: price !== "" ? Number(price) : undefined, mode: sessionMode, isPublic,
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
            <button className="btn btn-primary" disabled={!sessionValid || !cohortValid || (repeat !== "none" && occurrences().length === 0)} onClick={submitSession}>
              {requestMode ? "승인 요청 보내기" : historicalImport ? "완료 수업 이관" : repeat === "none" ? "수업 추가" : `반복 추가 (${occurrences().length}회)`}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!blockValid} onClick={submitBlocks}>
              {AVAILABILITY_KIND_LABEL[availabilityKindOf(type)]} 추가
            </button>
          )}
        </>
      )}
    >
        <ScheduleEntryTypeSelector value={type} onChange={(value) => { setType(value); setBlockError(null); }} />
        {requestMode && type === "session" && (
          /* [UX H1] 강사에게 실제 동작(승인 요청)을 사전 고지 — 버튼 라벨과 일치 */
          <div className="rounded-md px-2.5 py-1.5 text-caption" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}>
            DB에 연결된 내 담당 코스·학생만 선택할 수 있습니다. 수업은 매니저 승인 후 예정 상태로 확정됩니다.
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
            <InlineCreateField
              label="과목"
              createLabel="새 과목과 수업 과정 등록"
              expanded={inlineCreator === "course"}
              onToggle={() => toggleInlineCreator("course")}
              canCreate={!requestMode}
              controls={(
                <select className="input" value={courseId} onChange={(event) => pickCourse(Number(event.target.value))}>
                  {myCourses.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.subjectName} · {candidate.name}</option>)}
                </select>
              )}
            >
              <div className="space-y-4">
                <div>
                  <p className="text-caption font-semibold text-fg-muted mb-2">1. 과목 원본 등록</p>
                  <SubjectCreateForm compact onCreated={(created) => setInlineSubjectId(created.id)} />
                </div>
                <div className="border-t pt-3" style={{ borderColor: "var(--color-line-muted)" }}>
                  <p className="text-caption font-semibold text-fg-muted mb-2">2. 캘린더에서 선택할 수업 과정 등록</p>
                  <CourseCreateForm
                    compact
                    initialSubjectId={inlineSubjectId}
                    initialInstructorId={instructorId === "" ? undefined : instructorId === "unassigned" ? null : instructorId}
                    submitLabel="수업 과정 등록"
                    onCreated={(created) => {
                      setCourseId(created.id);
                      setInstructorId(created.instructorId ?? "unassigned");
                      setColor(created.color);
                    }}
                  />
                </div>
              </div>
            </InlineCreateField>
            <InlineCreateField
              label={`담당자 ${typeof instructorId === "number" && !instAvailable(instructorId) ? `· ⚠ ${instAvailabilityLabel(instructorId)}` : ""}`}
              createLabel="새 강사 등록"
              expanded={inlineCreator === "instructor"}
              onToggle={() => toggleInlineCreator("instructor")}
              canCreate={!requestMode && lockInstructorId == null && access.can("executive.manage")}
              controls={lockInstructorId == null ? (
                <select className="input" value={instructorId} onChange={(event) => setInstructorId(event.target.value === "unassigned" ? "unassigned" : event.target.value ? Number(event.target.value) : "")}>
                  <option value="unassigned">배정중</option>
                  {sortedInstructors.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{scheduleResourceName(candidate)} · {instAvailabilityLabel(candidate.id)}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={lockedInstructorName ?? "본인"} disabled readOnly />
              )}
            >
              <InstructorCreateForm compact onCreated={(created) => setInstructorId(created.id)} />
            </InlineCreateField>
            <InlineCreateField
              label="강의실"
              createLabel="새 강의실 등록"
              expanded={inlineCreator === "room"}
              onToggle={() => toggleInlineCreator("room")}
              canCreate={!requestMode}
              controls={(
                <select className="input" value={roomId} onChange={(event) => setRoomId(event.target.value ? Number(event.target.value) : "")}>
                  <option value="">미지정</option>
                  {rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              )}
            >
              <RoomCreateForm compact onCreated={(created) => setRoomId(created.id)} />
            </InlineCreateField>
            {/* [TBO-86I-3] 학생 선택(단체) — 재원생 전체 단일 검색 리스트(수강생 먼저). 기본은 아무도
                선택 안 됨·분모는 보이는 재원생 전체 수. 미수강생도 같은 리스트에서 검색·선택 — 선택 시
                서버 enrollment 자동 생성 후 코호트 포함. [TBO-87D owner 지시] 미수강 표기·성공 문구는
                제거(조용한 자동 등록 — 실패만 인라인). 수강생 전체 버튼은 수강생만 일괄 체크.
                수업은 학생 1명 이상 선택해야 추가된다. */}
            <InlineCreateField
              label={`학생 (${effPicked.size}/${studentPickerItems.length}명 선택)`}
              createLabel="새 학생 등록"
              expanded={inlineCreator === "student"}
              onToggle={() => toggleInlineCreator("student")}
              canCreate={!requestMode}
              controls={<div className="space-y-2">
                {studentPickerItems.length === 0 ? (
                  <p className="text-caption text-fg-subtle">선택할 수 있는 재원생이 없습니다. 아래에서 새 학생을 등록해 주세요.</p>
                ) : (
                  <div className="space-y-1">
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-sm" onClick={() => setPickedStudents(new Set(courseRoster.map((r) => r.id)))}>수강생 전체</button>
                    <button type="button" className="btn btn-sm" onClick={() => setPickedStudents(new Set())}>해제</button>
                  </div>
                  <SearchableCheckList
                    items={studentPickerItems}
                    selected={effPicked}
                    placeholder="재원생 이름 검색"
                    onToggle={toggleStudentPick}
                  />
                  {!cohortValid && (
                    <p className="text-caption text-fg-subtle" role="note">수업에 넣을 학생을 한 명 이상 선택하세요.</p>
                  )}
                  </div>
                )}
                {studentLinkMessage && (
                  <p className="text-caption text-danger" role="alert">{studentLinkMessage}</p>
                )}
              </div>}
            >
              <StudentRegistrationForm
                compact
                initialCourseId={courseId || undefined}
                onCreated={(result) => setPickedStudents(new Set([...effPicked, result.student.id]))}
              />
            </InlineCreateField>
            <ScheduleDateField value={date} onChange={setDate} />
            <ScheduleTimeRangeFields start={start} end={end} onStartChange={changeStart} onEndChange={setEnd} endHint={`진행 ${courseDur}분`} />
            {crossesMidnight && (
              /* [R-9] 자정 크로스 안내 — 익일 종료로 저장(단일 세션·sessionDate=시작일) */
              <p className="text-caption text-accent">🌙 종료가 시작보다 이르므로 <b>다음날 {end} 종료</b>(자정 크로스)로 저장됩니다.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="종류">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "class" | "level_test" | "counsel")}>
                  <option value="class">일반 수업</option>
                  <option value="level_test">진단고사</option>
                  {!requestMode && <option value="counsel">상담</option>}
                </select>
              </Field>
              {!requestMode && kind !== "class" ? (
                <Field label="가격(원) — 선택">
                  <input className="input" type="number" min={0} max={100000000} placeholder="예: 50000" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
              ) : <div />}
              <Field label="상태">
                {requestMode ? (
                  <input className="input" value="예정 (승인 후 확정)" disabled readOnly />
                ) : historicalImport ? (
                  <input className="input" value="완료 (출결 자동 확정)" disabled readOnly />
                ) : (
                  <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SessionStatus)}>
                    {MANUAL_SESSION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}{isCanceledStatus(s) ? " (시수 미측정)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {/* [C2D] 강사 요청 모드에서도 수업방식 노출 — 요청→승인까지 mode 보존 */}
              <Field label="수업방식">
                <select className="input" value={sessionMode} onChange={(e) => setSessionMode(e.target.value as typeof sessionMode)}>
                  <option value="in_person">대면</option>
                  <option value="online">비대면</option>
                </select>
              </Field>
              <Field label="색상"><ColorPicker value={color} onChange={setColor} /></Field>
              {!requestMode && (
                <Field label="공통 스케줄">
                  <label className="h-9 flex items-center gap-2">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                    <span className="text-caption">학원 전체공지로 공개</span>
                  </label>
                </Field>
              )}
            </div>
            {historicalImportVisible && (
                <div className="rounded-md border p-3 space-y-2" style={{ borderColor: "var(--color-line-muted)" }}>
                  <label className="flex items-start gap-2 text-body-sm">
                    <input
                      type="checkbox"
                      checked={historicalImport}
                      disabled={!historicalImportEligible && !historicalImport}
                      onChange={(event) => { setHistoricalImport(event.target.checked); setBlockError(null); }}
                    />
                    <span>
                      <b>완료 수업으로 이관</b>
                      <span className="block text-caption text-fg-muted">강사와 선택 학생의 출결을 정상으로 저장하고 완료 상태를 자동 확정합니다.</span>
                    </span>
                  </label>
                  {historicalImport && (
                    <Field label="이관 사유">
                      <textarea
                        className="input min-h-[52px] py-1.5"
                        rows={2}
                        maxLength={500}
                        placeholder="예: 기존 7월 수업 기록 이관"
                        value={importReason}
                        onChange={(event) => setImportReason(event.target.value)}
                      />
                    </Field>
                  )}
                  {!historicalImportEligible && <p className="text-caption text-danger" role="alert">과거의 단건 수업만 완료 상태로 이관할 수 있습니다. 완료 이관을 해제해 주세요.</p>}
                </div>
            )}
            <Field label="메모"><textarea className="input min-h-[52px] py-1.5" rows={2} placeholder="선택 — 메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            {historicalImport ? (
              <p className="text-caption text-fg-muted">완료 수업 이관은 실제 출결을 확정하므로 한 회차씩 저장합니다.</p>
            ) : (
              <ScheduleRepeatFields repeat={repeat} onRepeatChange={setRepeat} customWeekdays={customWds} onToggleWeekday={toggleWd}
                untilDate={untilDate} onUntilDateChange={setUntilDate} startDate={date} occurrencesCount={occurrences().length} noneLabel="그날만" />
            )}
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
            <ScheduleDateField value={date} onChange={setDate} />
            <ScheduleTimeRangeFields start={start} end={end} onStartChange={changeStart} onEndChange={setEnd} />
            <ScheduleRepeatFields repeat={repeat} onRepeatChange={setRepeat} customWeekdays={customWds} onToggleWeekday={toggleWd}
              untilDate={untilDate} onUntilDateChange={setUntilDate} startDate={date} occurrencesCount={occurrences().length} noneLabel="일회성" />
            <p className="text-caption text-fg-muted">{repeat === "none" ? "일회성 — 이 날짜에 한 번만 적용." : "매주 반복 — 이 날짜부터 종료일까지."}</p>
          </>
        )}
    </ModalShell>
  );
}
