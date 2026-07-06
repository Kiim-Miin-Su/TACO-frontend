// ──────────────────────────────────────────────────────────────
// 국가·시간대 변환 엔진(순수 함수) — 해외 학생용 "그 나라 시간 시간표"(피드백 2026-07-02).
// [설계]
//  - 세션의 저장 시간은 항상 **KST(Asia/Seoul) 단일 진실원**. 변환은 표시 전용이며,
//    KST가 아닌 시간대로 보는 동안 편집·드래그·복제는 잠근다(잘못된 시간 저장 방지 — 무결성).
//  - 변환: KST 로컬(date+HH:mm) → UTC(+09:00 고정) → 대상 tz 로컬(Intl.DateTimeFormat).
//    DST(서머타임)는 Intl이 시점별로 계산하므로 자동 반영.
//  - country(ISO alpha-2) → 대표 IANA tz 매핑(미국처럼 다중 tz 국가는 대표 도시 1곳 — 필요 시 학생별 tz 확장).
// ──────────────────────────────────────────────────────────────
import type { ScheduleRow } from '@/types';
// 시간·요일 유틸은 lib/domain/schedule 단일 소스(감사 M5 — 파일별 중복 pad/fromMin/weekday 금지 규칙과 통일)
import { fromMin, toMin, weekdayOf } from './schedule';

const addDaysISO = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type CountryInfo = { code: string; name: string; en: string; tz: string; flag: string };

// 대표 국가(자동완성 후보) — 유학·해외 수강 빈도 기준.
export const COUNTRIES: CountryInfo[] = [
  { code: 'KR', name: '한국', en: 'Korea', tz: 'Asia/Seoul', flag: '🇰🇷' },
  { code: 'US', name: '미국(동부)', en: 'United States', tz: 'America/New_York', flag: '🇺🇸' },
  { code: 'US-W', name: '미국(서부)', en: 'United States West', tz: 'America/Los_Angeles', flag: '🇺🇸' },
  { code: 'CA', name: '캐나다', en: 'Canada', tz: 'America/Toronto', flag: '🇨🇦' },
  { code: 'GB', name: '영국', en: 'United Kingdom', tz: 'Europe/London', flag: '🇬🇧' },
  { code: 'DE', name: '독일', en: 'Germany', tz: 'Europe/Berlin', flag: '🇩🇪' },
  { code: 'FR', name: '프랑스', en: 'France', tz: 'Europe/Paris', flag: '🇫🇷' },
  { code: 'AU', name: '호주', en: 'Australia', tz: 'Australia/Sydney', flag: '🇦🇺' },
  { code: 'NZ', name: '뉴질랜드', en: 'New Zealand', tz: 'Pacific/Auckland', flag: '🇳🇿' },
  { code: 'JP', name: '일본', en: 'Japan', tz: 'Asia/Tokyo', flag: '🇯🇵' },
  { code: 'CN', name: '중국', en: 'China', tz: 'Asia/Shanghai', flag: '🇨🇳' },
  { code: 'HK', name: '홍콩', en: 'Hong Kong', tz: 'Asia/Hong_Kong', flag: '🇭🇰' },
  { code: 'SG', name: '싱가포르', en: 'Singapore', tz: 'Asia/Singapore', flag: '🇸🇬' },
  { code: 'VN', name: '베트남', en: 'Vietnam', tz: 'Asia/Ho_Chi_Minh', flag: '🇻🇳' },
  { code: 'TH', name: '태국', en: 'Thailand', tz: 'Asia/Bangkok', flag: '🇹🇭' },
  { code: 'MY', name: '말레이시아', en: 'Malaysia', tz: 'Asia/Kuala_Lumpur', flag: '🇲🇾' },
  { code: 'PH', name: '필리핀', en: 'Philippines', tz: 'Asia/Manila', flag: '🇵🇭' },
  { code: 'ID', name: '인도네시아', en: 'Indonesia', tz: 'Asia/Jakarta', flag: '🇮🇩' },
  { code: 'IN', name: '인도', en: 'India', tz: 'Asia/Kolkata', flag: '🇮🇳' },
  { code: 'AE', name: 'UAE(두바이)', en: 'United Arab Emirates', tz: 'Asia/Dubai', flag: '🇦🇪' },
];

export const KST_TZ = 'Asia/Seoul';

export const countryByCode = (code?: string): CountryInfo | undefined =>
  code ? COUNTRIES.find((c) => c.code === code.toUpperCase()) : undefined;

/** 자동완성 검색: 한글명·영문명·코드 부분일치(대소문자 무시). */
export function searchCountries(q: string, limit = 8): CountryInfo[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  return COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(n) || c.en.toLowerCase().includes(n) || c.code.toLowerCase().includes(n),
  ).slice(0, limit);
}

// KST 로컬(date, HH:mm) → UTC epoch(ms). KST는 DST가 없어 +09:00 고정이 안전.
const kstToUtcMs = (date: string, hhmm: string): number => Date.parse(`${date}T${hhmm}:00+09:00`);

// UTC 시점을 대상 tz의 로컬 (date, minutes)로. Intl이 DST 포함 계산.
function utcToTzParts(utcMs: number, tz: string): { date: string; minutes: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24; // en-CA가 24시를 '24'로 줄 수 있음
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

/** 변환 결과 행 — 자정 크로스 시 익일 실제 종료 시각을 tzOverflowEnd('HH:mm')로 보존(잔여 배지용, TBO-12 P0). */
export type TzShiftedRow = ScheduleRow & { tzOverflowEnd?: string };

/**
 * 세션 1건을 대상 tz의 로컬 시간표로 변환(표시 전용 사본).
 * 자정을 넘으면 날짜가 밀리며 시작/종료가 다른 날이 될 수 있음 — 이 경우 종료는 그날 24:00로
 * 클램프하고 익일 실제 종료는 tzOverflowEnd에 보존한다(그리드가 "+1일 ~HH:mm" 배지로 표시 — 오독 방지).
 * durationMinutes는 원본 유지(시수 불변).
 * [감사 H 수정] endTime 없으면 UTC에서 duration을 더해 파생(항상 true 조건식·자정 모듈로 오염 제거).
 */
export function shiftRowToTz(row: ScheduleRow, tz: string): TzShiftedRow {
  if (!row.startTime || tz === KST_TZ) return row;
  const startUtc = kstToUtcMs(row.sessionDate, row.startTime);
  // 종료 UTC: endTime이 있으면 그대로, 없으면 시작+진행시간. KST 저장값에서 endTime<startTime은
  // 자정 넘김(익일 종료) — duration 기반으로 보정(모듈로 래핑 없이 실제 시점 유지).
  const rawEndUtc = row.endTime != null ? kstToUtcMs(row.sessionDate, row.endTime) : startUtc + row.durationMinutes * 60_000;
  // [R-1b 2026-07-06] F4(방어): 저장값이 '25:00' 등 무효 형식이면 Date.parse=NaN → utcToTzParts의
  //  formatToParts(Invalid Date)가 RangeError로 시차 그리드 렌더를 죽임 — 변환을 포기하고 원본을
  //  그대로 반환한다(크래시 방지·표시 강등). 유입 자체는 BE addMinutes [M3] 가드가 400으로 차단(e2e 회귀).
  if (!Number.isFinite(startUtc) || !Number.isFinite(rawEndUtc)) return row;
  const endUtc = rawEndUtc <= startUtc ? startUtc + row.durationMinutes * 60_000 : rawEndUtc;
  const s = utcToTzParts(startUtc, tz);
  const e = utcToTzParts(endUtc, tz);
  const sameDay = s.date === e.date;
  return {
    ...row,
    sessionDate: s.date,
    weekday: weekdayOf(s.date),
    startTime: fromMin(s.minutes),
    endTime: sameDay ? fromMin(e.minutes) : '24:00', // 자정 넘김 클램프(표시용)
    ...(sameDay ? {} : { tzOverflowEnd: fromMin(e.minutes) }), // 익일 실제 종료(잔여 배지)
  };
}

/** 목록 일괄 변환 — KST면 원본 그대로(참조 동일성 유지로 리렌더 최소화). */
export function shiftRowsToTz(rows: ScheduleRow[], tz: string): TzShiftedRow[] {
  if (tz === KST_TZ) return rows;
  return rows.map((r) => shiftRowToTz(r, tz));
}

// 대상 tz의 로컬 벽시계(date, HH:mm)를 UTC epoch(ms)로 — 추정 후 오프셋 보정(DST 자동 반영).
//  입력을 UTC로 가정한 뒤 그 순간의 tz 로컬과의 차이(오프셋)를 빼서 실제 UTC를 얻는다.
// [R-1b 2026-07-06] F1: 단일 패스는 오프셋을 추정 시점(guessUtc)에서 1회만 읽어 DST 전환일에 1시간 오염
//  (실측: NY 2026-03-08 03:30 → KST 17:30 오답, 정답 16:30 — 왕복 시 세션이 1시간 이동).
//  → 표준 2-패스 보정: 1차 추정 시점의 오프셋으로 재계산해 shiftRowToTz(정방향)와 왕복 일치.
//  (봄 전환 갭의 존재하지 않는 벽시계는 인접 유효 시각으로 수렴 — 입력 UI는 실존 표시값만 주므로 실사용 무해)
function tzLocalToUtcMs(dateLocal: string, hhmm: string, tz: string): number {
  const guessUtc = Date.parse(`${dateLocal}T${hhmm}:00Z`);
  let utc = guessUtc;
  for (let i = 0; i < 2; i++) {
    const p = utcToTzParts(utc, tz);
    const back = Date.parse(`${p.date}T${fromMin(p.minutes)}:00Z`);
    utc = guessUtc - (back - utc); // 현재 추정 시점의 오프셋(back−utc)으로 재보정
  }
  return utc;
}

/**
 * 대상 tz의 로컬 (date, HH:mm) → KST 로컬 (date, HH:mm). shiftRowToTz(KST→tz)의 역변환.
 * 해외 학생 뷰에서 그 나라 현지 시각으로 입력한 값을 KST 저장값으로 되돌린다(무결성 — 저장은 항상 KST).
 * KST면 입력 그대로. 결과 날짜가 KST에서 밀릴 수 있음(자정 크로스 — 호출부가 sessionDate/시각에 반영).
 */
export function tzLocalToKst(dateLocal: string, hhmm: string, tz: string): { date: string; time: string } {
  if (!tz || tz === KST_TZ) return { date: dateLocal, time: hhmm };
  const utc = tzLocalToUtcMs(dateLocal, hhmm, tz);
  const k = utcToTzParts(utc, KST_TZ);
  return { date: k.date, time: fromMin(k.minutes) };
}

/**
 * [이슈1] 편집/생성 패치의 현지 시각(sessionDate·startTime·endTime)을 KST 저장값으로 역변환.
 *  시작 시각 기준으로 KST 날짜 확정 — 저장은 항상 KST 단일 진실원(무결성).
 * [R-1b 2026-07-06] F3: ScheduleCalendar 로컬 함수를 순수 함수로 이동(vitest 회귀 대상) + 클램프 방어 추가.
 *  자정 크로스 세션의 시차 표시는 endTime='24:00' 클램프(+tzOverflowEnd 배지)인데, 편집 모달 패치에
 *  이 클램프 값이 그대로 실려 오면 tzLocalToKst('24:00')이 로컬 자정 기준으로 변환돼 KST 종료가 조용히
 *  단축된다(실측: KST 12:30–14:00 → 12:30–13:00, 60분 소실). TimeSelect가 24시를 표현 못 해 생기는
 *  '24:05' 같은 무효값은 Date.parse NaN → RangeError 크래시.
 *  → endTime>'23:59'면 **endTime을 패치에서 제거**: 백엔드 mergeFields가 durationMinutes를 보존한 채
 *  종료를 재계산하므로 시수·실제 종료가 원본 그대로 유지된다(저장 누출 차단 — 기존 검증 경로 유지).
 */
export function kstPatchTimes<T extends { sessionDate?: string; startTime?: string; endTime?: string }>(patch: T, tz: string): T {
  if (!tz || tz === KST_TZ || !patch.sessionDate || !patch.startTime) return patch;
  const ks = tzLocalToKst(patch.sessionDate, patch.startTime, tz);
  const keTime = patch.endTime && patch.endTime <= '23:59' ? tzLocalToKst(patch.sessionDate, patch.endTime, tz).time : undefined;
  const out = { ...patch, sessionDate: ks.date, startTime: ks.time, ...(keTime ? { endTime: keTime } : {}) };
  if (patch.endTime && !keTime) delete (out as { endTime?: string }).endTime; // 클램프('24:00')·무효('24:05') 누출 차단
  return out;
}

export type TzWindow = { startMin: number; endMin: number };
export type WeeklyBlock = { weekday: number; startTime: string; endTime: string; effectiveFrom?: string; effectiveTo?: string };

/**
 * KST 주간 블록(가용/불가 — weekday·HH:mm~HH:mm·effective 범위)을 대상 tz의 특정 로컬 날짜 컬럼 좌표로 변환.
 * 세션 변환과 동일 엔진(shiftRowToTz) 재사용(이슈3). 그 날짜에 안 걸리면 null.
 *  - KST: weekday·effective 매칭만(직접 배치).
 *  - 비KST: 후보 KST 날짜(±1일)에서 변환 결과 날짜가 colDateTz인 것 채택. 자정 넘김은 endMin=1440 클램프.
 */
export function kstBlockToTzWindow(b: WeeklyBlock, colDateTz: string, tz: string): TzWindow | null {
  const inRange = (d: string) => (!b.effectiveFrom || d >= b.effectiveFrom) && (!b.effectiveTo || d <= b.effectiveTo);
  if (!tz || tz === KST_TZ) {
    if (b.weekday !== weekdayOf(colDateTz) || !inRange(colDateTz)) return null;
    return { startMin: toMin(b.startTime), endMin: toMin(b.endTime) };
  }
  const dur = toMin(b.endTime) - toMin(b.startTime);
  for (const dd of [-1, 0, 1]) {
    const D = addDaysISO(colDateTz, dd);
    if (weekdayOf(D) !== b.weekday || !inRange(D)) continue;
    const sh = shiftRowToTz({ sessionDate: D, startTime: b.startTime, endTime: b.endTime, durationMinutes: dur } as ScheduleRow, tz);
    if (sh.sessionDate !== colDateTz) continue;
    const startMin = toMin(sh.startTime!);
    const endMin = sh.endTime === '24:00' ? 1440 : toMin(sh.endTime!);
    if (endMin <= startMin) continue;
    return { startMin, endMin };
  }
  return null;
}

/** 특정 날짜의 KST 대비 시차(분) — 헤더 배지 "미국(동부) −13h" 표시용. */
export function tzOffsetFromKst(tz: string, dateISO: string): number {
  const utc = kstToUtcMs(dateISO, '12:00');
  const kst = utcToTzParts(utc, KST_TZ);
  const other = utcToTzParts(utc, tz);
  const dayDelta = Math.round((Date.parse(other.date) - Date.parse(kst.date)) / 86_400_000);
  return dayDelta * 24 * 60 + (other.minutes - kst.minutes);
}


// [버그수정 2026-07-06] 시차 컬럼에서 추가한 가용/불가를 KST로 저장할 때, 현지 구간이 KST 자정을
//  넘으면(예: 미국 오전 = KST 23:00~익일 01:00) end<start로 저장돼 KST 뷰에서 미렌더되던 문제.
//  → KST 날짜가 갈리면 [시작~23:59] + [00:00~끝] **두 블록으로 분할**(각자 자기 요일·날짜).
//  1분 갭(23:59~24:00)은 dto HH:mm 제약(24:00 불가)에 따른 근사 — 표시·충돌 실용상 무해.
export type KstBandPart = { date: string; weekday: number; startTime: string; endTime: string };

export function splitKstBand(ks: { date: string; time: string }, ke: { date: string; time: string }): KstBandPart[] {
  if (ks.date === ke.date) {
    return [{ date: ks.date, weekday: weekdayOf(ks.date), startTime: ks.time, endTime: ke.time }];
  }
  const parts: KstBandPart[] = [{ date: ks.date, weekday: weekdayOf(ks.date), startTime: ks.time, endTime: '23:59' }];
  if (ke.time !== '00:00') parts.push({ date: ke.date, weekday: weekdayOf(ke.date), startTime: '00:00', endTime: ke.time });
  return parts;
}
