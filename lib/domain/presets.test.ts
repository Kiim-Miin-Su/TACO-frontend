// 뷰 프리셋 직렬화 왕복(round-trip) 검증 — 저장→복원이 상태를 보존해야 프리셋이 자산으로 신뢰 가능.
import { describe, expect, it } from 'vitest';
import type { CalendarViewPreset } from '@/types';
import { serializeViewPreset, presetToState, type CalendarViewState } from './presets';
import { countryByCode } from './tz';

const state = (over: Partial<CalendarViewState> = {}): CalendarViewState => ({
  view: 'week', period: { from: '2026-07-01', to: '2026-07-03' }, q: ' SAT ', colorBy: 'subject',
  fInstructors: new Set([1, 2]), fStudents: new Set([1]), fRooms: new Set(),
  fSubjects: new Set(['영어']), fStatuses: new Set(['attended', 'late']), fModes: new Set(), fKinds: new Set(), groupOnly: true,
  country: countryByCode('US') ?? null,
  paneCountry: { instructor: null, student: countryByCode('US') ?? null }, // 강사 표=강제 KST
  ...over,
});

describe('serializeViewPreset ↔ presetToState (round-trip)', () => {
  it('필터·기간·국가·표별 override가 왕복 보존된다 (null override는 KR로 직렬화)', () => {
    const body = serializeViewPreset('미국 학생 주간', state());
    expect(body).toMatchObject({
      name: '미국 학생 주간', view: 'week', periodFrom: '2026-07-01', periodTo: '2026-07-03',
      instructorIds: [1, 2], studentIds: [1], subjects: ['영어'], statuses: ['attended', 'late'],
      groupOnly: true, q: 'SAT', countryCode: 'US',
      paneCountryInstructor: 'KR', // null(강제 KST) → 'KR' 규칙
      paneCountryStudent: 'US',
    });
    const restored = presetToState({ id: 1, ...body } as CalendarViewPreset);
    expect([...restored.fInstructors]).toEqual([1, 2]);
    expect(restored.period).toEqual({ from: '2026-07-01', to: '2026-07-03' });
    expect(restored.country?.code).toBe('US');
    expect(restored.paneCountry.instructor?.code).toBe('KR'); // KR=KST와 동작 동일
  });

  it('[v0.1.14 #2] kinds(종류 필터) 왕복 — 빈 선택=미저장(전체), 미지 값은 복원 시 무시(내성)', () => {
    // 빈 Set → kinds 미저장(undefined)
    expect(serializeViewPreset('x', state()).kinds).toBeUndefined();
    // 선택 → 저장·복원 보존
    const body = serializeViewPreset('진단·상담만', state({ fKinds: new Set(['level_test', 'counsel']) }));
    expect(body.kinds).toEqual(['level_test', 'counsel']);
    const restored = presetToState({ id: 2, ...body } as CalendarViewPreset);
    expect([...restored.fKinds].sort()).toEqual(['counsel', 'level_test']);
    // 미지 코드 내성(스키마 진화 대비)
    const legacy = presetToState({ id: 3, ...body, kinds: ['counsel', 'unknown_kind'] } as CalendarViewPreset);
    expect([...legacy.fKinds]).toEqual(['counsel']);
    expect(restored.paneCountry.student?.code).toBe('US');
    expect([...restored.fStatuses]).toEqual(['attended', 'late']);
  });

  it('빈 상태: 기간·국가·override 미저장, 복원 시 기본값', () => {
    const body = serializeViewPreset('기본', state({
      period: null, q: '', country: null, paneCountry: {}, fInstructors: new Set(),
      fStudents: new Set(), fSubjects: new Set(), fStatuses: new Set(), groupOnly: false,
    }));
    expect(body.periodFrom).toBeUndefined();
    expect(body.countryCode).toBeUndefined();
    expect(body.paneCountryInstructor).toBeUndefined();
    expect(body.q).toBeUndefined();
    const r = presetToState({ id: 2, ...body } as CalendarViewPreset);
    expect(r.period).toBeNull();
    expect(r.country).toBeNull();
    expect(Object.keys(r.paneCountry)).toHaveLength(0);
  });

  it('[v0.1.17] 수동 표·표별 국가·수업방식·KST 고정 상태를 함께 저장한다', () => {
    const body = serializeViewPreset('비교 뷰', state({
      fModes: new Set(['online']),
      kstFixed: true,
      compactCols: true,
      manualPanes: [
        { uid: 10, dim: 'student', ids: [3], country: countryByCode('GB') ?? null, modes: new Set(['online']) },
        { uid: 11, dim: 'instructor', ids: [2], country: null, modes: new Set() },
      ],
    })) as CalendarViewPreset & {
      modeFilters?: string[];
      manualPanes?: { uid?: number; dim: string; ids: number[]; countryCode?: string; modeFilters?: string[] }[];
      kstFixed?: boolean;
      compactCols?: boolean;
    };
    expect(body.modeFilters).toEqual(['online']);
    expect(body.kstFixed).toBe(true);
    expect(body.compactCols).toBe(true);
    expect(body.manualPanes?.[0]).toMatchObject({ uid: 10, dim: 'student', ids: [3], countryCode: 'GB', modeFilters: ['online'] });
    const restored = presetToState({ ...body, id: 7 } as CalendarViewPreset);
    expect([...restored.fModes]).toEqual(['online']);
    expect(restored.kstFixed).toBe(true);
    expect(restored.compactCols).toBe(true);
    expect(restored.manualPanes?.map((p) => [p.uid, p.dim, p.ids[0], p.country?.code, [...p.modes][0] ?? null])).toEqual([
      [10, 'student', 3, 'GB', 'online'],
      [11, 'instructor', 2, undefined, null],
    ]);
  });

  it('미지의 국가 코드는 null로 강등(국가 목록 변경 내성 — 크래시 없음)', () => {
    const r = presetToState({
      id: 3, name: 'x', view: 'week', instructorIds: [], studentIds: [], roomIds: [],
      subjects: [], statuses: [], groupOnly: false, countryCode: 'ZZ',
    } as CalendarViewPreset);
    expect(r.country).toBeNull();
  });
});
