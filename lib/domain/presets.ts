// ──────────────────────────────────────────────────────────────
// 캘린더 뷰 프리셋 직렬화(TBO-12 P1) — 필터·스플릿·국가(시차) 상태 ↔ DB 프리셋(contracts v0.1.12).
// [자산화] 저장소는 백엔드 calendar_view_presets 컬렉션(직원 공용 자산 — localStorage 아님).
// [규칙] paneCountry override의 null(강제 KST)은 'KR' 코드로 직렬화 — 복원 시 KR=KST와 동작 동일.
// ──────────────────────────────────────────────────────────────
import type { CalendarViewPreset, CreateViewPresetInput } from '@/types';
import { countryByCode, type CountryInfo } from './tz';
import type { SplitDim, StatusFilter } from './lantiv';

export type CalendarViewState = {
  view: 'month' | 'week' | 'day';
  period: { from: string; to: string } | null;
  q: string;
  colorBy: string;
  fInstructors: Set<number>;
  fStudents: Set<number>;
  fRooms: Set<number>;
  fSubjects: Set<string>;
  fStatuses: Set<StatusFilter>;
  groupOnly: boolean;
  country: CountryInfo | null;
  paneCountry: Partial<Record<SplitDim, CountryInfo | null>>;
};

/** 현재 캘린더 상태 → 저장용 프리셋 본문. */
export function serializeViewPreset(name: string, s: CalendarViewState): CreateViewPresetInput {
  const pane = (dim: SplitDim): string | undefined =>
    dim in s.paneCountry ? (s.paneCountry[dim]?.code ?? 'KR') : undefined; // null(강제 KST)→'KR'
  return {
    name,
    view: s.view,
    periodFrom: s.period?.from,
    periodTo: s.period?.to,
    instructorIds: [...s.fInstructors],
    studentIds: [...s.fStudents],
    roomIds: [...s.fRooms],
    subjects: [...s.fSubjects],
    statuses: [...s.fStatuses],
    groupOnly: s.groupOnly,
    q: s.q.trim() || undefined,
    colorBy: s.colorBy,
    countryCode: s.country?.code,
    paneCountryInstructor: pane('instructor'),
    paneCountryStudent: pane('student'),
  };
}

/** 프리셋 → 적용용 상태(컴포넌트가 각 setter로 흘려보냄). 미지의 국가 코드는 무시(목록 변경 내성). */
export function presetToState(p: CalendarViewPreset): CalendarViewState {
  const pane: CalendarViewState['paneCountry'] = {};
  if (p.paneCountryInstructor) pane.instructor = countryByCode(p.paneCountryInstructor) ?? null;
  if (p.paneCountryStudent) pane.student = countryByCode(p.paneCountryStudent) ?? null;
  return {
    view: p.view,
    period: p.periodFrom && p.periodTo ? { from: p.periodFrom, to: p.periodTo } : null,
    q: p.q ?? '',
    colorBy: p.colorBy ?? 'subject',
    fInstructors: new Set(p.instructorIds.map(Number)),
    fStudents: new Set(p.studentIds.map(Number)),
    fRooms: new Set(p.roomIds.map(Number)),
    fSubjects: new Set(p.subjects),
    fStatuses: new Set(p.statuses as StatusFilter[]),
    groupOnly: p.groupOnly,
    country: p.countryCode ? (countryByCode(p.countryCode) ?? null) : null,
    paneCountry: pane,
  };
}
