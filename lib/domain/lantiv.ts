// ──────────────────────────────────────────────────────────────
// Lantiv형 캘린더 엔진 (순수 함수) — 뷰와 분리, vitest로 검증.
// [참조/처리]
//  - 입력: ScheduleRow(GET /schedule enriched 읽기모델) · Attendance(GET /attendance, 세션×학생 출결).
//  - 상태 판정(출석/지각/결강/보강) = 세션 status + 강사 출결(instructorAttendance) + 학생 출결 조합
//    (docs/FABLE.md §4.3: "결강"=취소/no_show, "보강"=makeup. TBO-09: 지각·결강은 강사|학생 모두).
//  - 스플릿 컬럼 = (날짜 × 선택 리소스) 곱집합 — ScheduleCalendar 그리드가 컬럼 모델로 재사용.
//  - 여기는 데이터 파생만. fetch/상태/렌더 없음(단위 테스트 용이 — lantiv.test.ts).
// ──────────────────────────────────────────────────────────────
import type { ScheduleRow, Attendance, RecurrenceScope } from '@/types';
import { fromMin } from './schedule';

// ── 뷰 공통 상수(색·라벨) — ScheduleCalendar/우측 패널이 공유(단일 소스) ──
export const PALETTE = ['#0969da', '#1a7f37', '#8250df', '#bf3989', '#9a6700', '#1b7c83'];
export const STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  held: '진행됨',
  canceled: '결강',
  no_show: '취소',
  makeup: '보강',
};
export const INSTRUCTOR_ATT_LABEL: Record<string, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  makeup: '보강',
};

// ── 상태 필터 4종(Lantiv 스펙): 출석=문제없음 · 지각=강사|학생 · 결강=강사|학생·취소 · 보강 ──
export type StatusFilter = 'attended' | 'late' | 'absence' | 'makeup';
export const STATUS_FILTERS: StatusFilter[] = ['attended', 'late', 'absence', 'makeup'];
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  attended: '출석',
  late: '지각',
  absence: '결강',
  makeup: '보강',
};

type StateInput = Pick<ScheduleRow, 'status' | 'instructorAttendance'>;

/** 세션이 갖는 상태 집합(중복 가능 — 예: 학생 지각 + 보강 세션). */
export function sessionStates(row: StateInput, studentAtt: Attendance[] = []): Set<StatusFilter> {
  const out = new Set<StatusFilter>();
  const late = row.instructorAttendance === 'late' || studentAtt.some((a) => a.status === 'late');
  const absent =
    row.status === 'canceled' ||
    row.status === 'no_show' ||
    row.instructorAttendance === 'absent' ||
    studentAtt.some((a) => a.status === 'absent');
  const makeup = row.status === 'makeup' || row.instructorAttendance === 'makeup';
  if (late) out.add('late');
  if (absent) out.add('absence');
  if (makeup) out.add('makeup');
  // 출석 = 실제 진행(held)됐고 지각·결강 이슈가 없음("문제 없음")
  if (row.status === 'held' && !late && !absent) out.add('attended');
  return out;
}

/** 활성 필터가 비어 있으면 전체 통과. 있으면 세션 상태와 교집합이 있어야 통과("결강만", "보강만" 등). */
export function matchesStatusFilter(row: StateInput, studentAtt: Attendance[], active: Set<StatusFilter>): boolean {
  if (!active.size) return true;
  const st = sessionStates(row, studentAtt);
  for (const f of active) if (st.has(f)) return true;
  return false;
}

/** 그룹 수업 = 코호트(활성 수강생) 2명 이상. */
export const isGroupSession = (r: Pick<ScheduleRow, 'studentIds'>): boolean => (r.studentIds?.length ?? 0) >= 2;

/** 날짜 → 시작시각 → id 오름차순 — 우측 리스트 패널 정렬 규칙(스펙: 날짜별 오름차순). */
export function sortByDateAsc<T extends Pick<ScheduleRow, 'sessionDate' | 'startTime' | 'id'>>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.sessionDate.localeCompare(b.sessionDate) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      Number(a.id) - Number(b.id),
  );
}

// ── 우측 리스트 그룹핑(그룹 토글: 예— 학생 선택 시 학생별 그룹 → 그룹 내 날짜순) ──
export type ListGroupBy = 'none' | 'student' | 'instructor' | 'room';
export type ListGroup = { key: string; label: string; rows: ScheduleRow[] };

export function groupSessions(rows: ScheduleRow[], by: ListGroupBy): ListGroup[] {
  const sorted = sortByDateAsc(rows);
  if (by === 'none') return [{ key: 'all', label: '', rows: sorted }];
  const m = new Map<string, ListGroup>();
  const put = (key: string, label: string, r: ScheduleRow) => {
    const g = m.get(key) ?? { key, label, rows: [] };
    g.rows.push(r);
    m.set(key, g);
  };
  for (const r of sorted) {
    if (by === 'student') {
      const ids = r.studentIds ?? [];
      // 그룹 수업은 학생마다 한 번씩(각 학생 그룹에서 자기 수업이 보여야 함 — Lantiv 학생별 뷰)
      if (!ids.length) put('s-none', '학생 미배정', r);
      else ids.forEach((id, i) => put(`s${id}`, r.studentNames?.[i] ?? `학생#${id}`, r));
    } else if (by === 'instructor') {
      put(`i${r.instructorId}`, r.instructorName, r);
    } else {
      put(`r${r.roomId ?? 0}`, r.roomName ?? '강의실 미지정', r);
    }
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

// ── 스플릿 뷰 컬럼(날짜 × 리소스) — Lantiv 다중 선택 시 하루를 리소스별 서브컬럼으로 ──
export type SplitDim = 'instructor' | 'student' | 'room';
export type SplitPick = { id: number; name: string };
export type SplitCol = {
  key: string;
  date: string;
  resType: SplitDim;
  resId: number;
  label: string; // 리소스 이름(컬럼 헤더)
  roomId?: number; // room 스플릿이면 드래그 드롭(data-roomid) 재사용을 위해 채움
  firstOfDate: boolean; // 날짜 경계(굵은 구분선용)
};

/** 스플릿 컬럼 상한 — 한 화면 컬럼 폭주 방지(TBO-09 "최대 수를 정해야 할 듯함"). */
export const MAX_SPLIT = 6;

/** (날짜 × 리소스) 컬럼 생성. picks 순서 보존, 날짜마다 첫 리소스에 firstOfDate 마킹. */
export function buildSplitColumns(dates: string[], dim: SplitDim, picks: SplitPick[]): SplitCol[] {
  return buildMixedSplitColumns(dates, picks.map((p) => ({ ...p, type: dim })));
}

// 혼합 스플릿(피드백 2026-07-02): 강사+학생을 함께 선택하면 한 날짜 안에 강사 컬럼들과
// 학생 컬럼들이 나란히 — 양쪽 시간표를 보며 배치("시간표 테트리스"). 타입 혼합 허용.
export type MixedPick = SplitPick & { type: SplitDim };
export function buildMixedSplitColumns(dates: string[], picks: MixedPick[]): SplitCol[] {
  const out: SplitCol[] = [];
  for (const date of dates) {
    picks.forEach((p, i) => {
      out.push({
        key: `${date}|${p.type}${p.id}`,
        date,
        resType: p.type,
        resId: Number(p.id),
        label: p.name,
        roomId: p.type === 'room' ? Number(p.id) : undefined,
        firstOfDate: i === 0,
      });
    });
  }
  return out;
}

/**
 * 리소스 필터 매칭(그리드·리스트 공통) — 강사·학생은 **합집합(OR)**.
 * 이전엔 (강사∈선택 AND 학생∈선택) 교집합이라 강사+학생 동시 다중선택 시
 * 공유 수업 외 전부 사라지는 버그("학생 2명밖에 안 보임"). 강의실은 별도 AND 유지(장소 한정).
 */
export function matchesResourceFilter(
  r: Pick<ScheduleRow, 'instructorId' | 'roomId' | 'studentIds'>,
  sel: { instructors: Set<number>; students: Set<number>; rooms: Set<number> },
): boolean {
  if (sel.rooms.size && !(r.roomId != null && sel.rooms.has(Number(r.roomId)))) return false;
  const instOn = sel.instructors.size > 0;
  const studOn = sel.students.size > 0;
  if (!instOn && !studOn) return true;
  const hitInst = instOn && sel.instructors.has(Number(r.instructorId));
  const hitStud = studOn && (r.studentIds ?? []).some((id) => sel.students.has(Number(id)));
  return hitInst || hitStud;
}

// ── 수업 편집 패치 빌드(TBO-10 #3) — DetailModal·SessionDetailPanel 공통(단일 검증·단일 규칙) ──
export type SessionDraft = {
  sessionDate: string;
  startTime: string;
  endTime: string;
  instructorId?: number;
  roomId?: number; // undefined = 변경 없음(백엔드 merge가 기존값 유지)
  status: ScheduleRow['status'];
  topic?: string;
  memo?: string;
  color?: string;
  kind?: SessionKindFilter; // [v0.1.14] 종류(일반/진단고사/상담)
  price?: number; // [v0.1.14] 세션 단건 가격(상담 등)
  scope: RecurrenceScope; // 반복 적용 범위 — 이 수업만 / 이 이후 / 시리즈 전체
};

/**
 * 편집 폼 → PATCH /schedule/:id 바디. 규칙:
 *  - 시작 ≠ 종료 필수(같으면 throw — 폼에서 사전 차단하지만 이중 방어).
 *  - [R-9 2026-07-06] 종료 < 시작은 **익일 종료(자정 크로스)**로 허용 — BE가 +1440 래핑해
 *    durationMinutes로 저장(endTime 미저장·단일 세션). 폼은 "익일 종료로 저장됩니다"를 안내.
 *  - scope는 **시리즈일 때만** 포함(단건에 scope를 보내지 않음 — API 계약 명확화).
 *  - topic 빈 문자열은 미전송(백엔드 merge가 기존값 유지 — 실수로 지워지는 것 방지).
 *  - 학생(코호트)은 이 패치로 편집 불가 — enrollment 파생(참조 무결성).
 */
export function sessionEditPatch(
  d: SessionDraft,
  isSeries: boolean,
): {
  sessionDate: string; startTime: string; endTime: string; instructorId?: number; roomId?: number;
  status: ScheduleRow['status']; topic?: string; memo?: string; color?: string; scope?: RecurrenceScope;
  kind?: SessionKindFilter; price?: number;
} {
  if (d.startTime === d.endTime) throw new Error('종료 시각이 시작과 같을 수 없습니다'); // [R-9] end<start=익일 종료 허용
  return {
    sessionDate: d.sessionDate,
    startTime: d.startTime,
    endTime: d.endTime,
    instructorId: d.instructorId,
    roomId: d.roomId,
    status: d.status,
    topic: d.topic?.trim() ? d.topic : undefined,
    memo: d.memo,
    color: d.color,
    kind: d.kind,
    price: d.price,
    ...(isSeries ? { scope: d.scope } : {}),
  };
}

// ── 복제(Ctrl+C/V · Ctrl+드래그) — Lantiv 셀 복제 대응 ──
// 커서 셀(빈 공간 클릭 지점) 또는 드롭 지점을 대상으로 원본 세션의 복제 생성 바디를 만든다.
export type PasteTarget = {
  date: string;
  startMin: number; // 스냅된 시작 시각(분)
  resType?: SplitDim; // 스플릿 컬럼이면 그 컬럼 리소스로 재배정(강사/강의실)
  resId?: number;
  roomId?: number; // 일간(강의실) 컬럼의 roomid 데이터셋
};

/**
 * 세션 복제 바디(POST /schedule 입력) — 참조 무결성 규칙:
 *  - 복제본은 **단건**(seriesId 승계 안 함) · status='scheduled' 고정(진행 이력 아님).
 *  - 출결(instructorAttendance)·리포트·정산 연결은 승계하지 않음(시수 이중 계상 방지).
 *  - 스플릿 강사 컬럼에 붙이면 그 강사로 재배정(백엔드 FK·충돌 검증 통과 필요).
 *    학생 컬럼은 재배정 없음(코호트=enrollment 파생) — 원본 코스 그대로.
 *  - durationMinutes 유지, 시작시각 = 커서(클릭) 시각.
 */
export function cloneSessionBody(
  src: Pick<ScheduleRow, 'courseId' | 'instructorId' | 'roomId' | 'durationMinutes' | 'topic' | 'memo' | 'color'>,
  t: PasteTarget,
): {
  courseId: number; instructorId: number; roomId?: number; sessionDate: string;
  startTime: string; endTime: string; topic?: string; memo?: string; color?: string; status: 'scheduled';
} {
  const instructorId = t.resType === 'instructor' && t.resId != null ? t.resId : Number(src.instructorId);
  const roomId =
    t.resType === 'room' && t.resId != null ? t.resId : (t.roomId ?? (src.roomId != null ? Number(src.roomId) : undefined));
  return {
    courseId: Number(src.courseId),
    instructorId,
    roomId,
    sessionDate: t.date,
    startTime: fromMin(t.startMin),
    // [R-9] 커서가 심야면 종료가 자정을 넘을 수 있음 — %1440 래핑('25:00' 금지). BE가 end<start를
    //  익일 종료로 해석해 durationMinutes로 저장(자정 크로스 정식 지원 — 구 400 거부 폐지).
    endTime: fromMin((t.startMin + src.durationMinutes) % 1440),
    topic: src.topic,
    memo: src.memo,
    color: src.color,
    status: 'scheduled',
  };
}

/**
 * [버그수정 2026-07-02] 학생 컬럼 붙여넣기 — 대상 학생의 코스 결정(코호트=enrollment 파생 무결성 유지).
 *  김서연 세션을 이도현 컬럼에 붙일 때, 이도현이 원본 코스 수강 중이면 그대로,
 *  아니면 **같은 과목의 활성 수강 코스** 우선 → 없으면 첫 활성 코스로 재배정 → 활성 수강이 없으면 null(중단).
 *  (임의 코스로 붙이면 세션 코호트에 대상 학생이 없어 유령 세션이 되므로 반드시 수강 기반으로만.)
 */
export function resolvePasteCourseId(
  srcCourseId: number,
  targetStudentId: number,
  enrollments: { studentId: number | string; courseId: number | string; status?: string }[],
  courses: { id: number | string; subjectId?: number | string }[],
): number | null {
  const active = enrollments.filter(
    (e) => Number(e.studentId) === targetStudentId && (e.status ?? 'active') === 'active',
  );
  if (active.some((e) => Number(e.courseId) === srcCourseId)) return srcCourseId;
  const subjectOf = new Map(courses.map((c) => [Number(c.id), c.subjectId != null ? Number(c.subjectId) : undefined]));
  const srcSubject = subjectOf.get(srcCourseId);
  const sameSubject = srcSubject != null ? active.find((e) => subjectOf.get(Number(e.courseId)) === srcSubject) : undefined;
  const pick = sameSubject ?? active[0];
  return pick ? Number(pick.courseId) : null;
}

/** 행이 컬럼 리소스에 속하는가 — 학생은 코호트(studentIds) 포함 여부(참조 무결성: enrollment 파생). */
export function rowInResource(
  r: Pick<ScheduleRow, 'instructorId' | 'roomId' | 'studentIds'>,
  type: SplitDim,
  id: number,
): boolean {
  if (type === 'instructor') return r.instructorId === id;
  if (type === 'room') return r.roomId === id;
  return (r.studentIds ?? []).includes(id);
}


// ── [v0.1.14 #2] 세션 종류(kind) 필터 어휘 — 도메인 단일 소스(FilterBar·프리셋·표별 필터 공용) ──
export type SessionKindFilter = 'class' | 'level_test' | 'counsel';
export const KIND_FILTERS: SessionKindFilter[] = ['class', 'level_test', 'counsel'];
export const KIND_FILTER_LABEL: Record<SessionKindFilter, string> = { class: '일반', level_test: '진단고사', counsel: '상담' };

// ── [R2 2026-07-06] 스플릿 컴팩트 단계형 밀도 — 단일 함수(TBO-16 #1 마감) ──
//  하루 열 폭은 COL_MIN 고정, 안을 인원수로 서브분할(subW = COL_MIN/perDay).
//  단계: full(전체 내용) ≥80px → title(가로 축약 제목+시간) ≥46 → vtitle(세로 글) ≥24 → color(색상 라벨만).
//  전체 정보는 블록 title 툴팁으로 항상 보존(렌더 계층 책임).
export type TextDensity = 'full' | 'title' | 'vtitle' | 'color';

export function densityOf(subW: number, isSplit: boolean): TextDensity {
  if (!isSplit || subW >= 80) return 'full';
  if (subW >= 46) return 'title';
  if (subW >= 24) return 'vtitle';
  return 'color';
}


// [버그수정 2026-07-06 2단] KST 그리드 축 자동 확장 — 기본 08~22시지만, 축 밖 콘텐츠(해외 학생의
//  KST 심야 밴드·세션)가 있으면 그 시간까지 확장(잘려서 '사라짐' 방지). 시차 축은 항상 0~24.
export function expandAxis(axisTz: boolean, contentLoMin: number, contentHiMin: number, baseStartH = 8, baseEndH = 22): { startH: number; endH: number } {
  if (axisTz) return { startH: 0, endH: 24 };
  const startH = Math.min(baseStartH, Math.max(0, Math.floor(contentLoMin / 60)));
  const endH = Math.max(baseEndH, Math.min(24, Math.ceil(contentHiMin / 60)));
  return { startH, endH };
}
