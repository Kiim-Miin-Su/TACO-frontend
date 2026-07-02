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

const two = (n: number) => String(n).padStart(2, '0');
const minToHHMM = (m: number) => `${two(Math.floor(m / 60))}:${two(m % 60)}`;
const weekdayOfDate = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();

/**
 * 세션 1건을 대상 tz의 로컬 시간표로 변환(표시 전용 사본).
 * 자정을 넘으면 날짜가 밀리며 시작/종료가 다른 날이 될 수 있음 — 이 경우 종료는 그날 24:00로
 * 클램프하고 다음날 잔여는 표시하지 않는다(단순화 — 시간표 인쇄 목적에 충분, durationMinutes 원본 유지).
 */
export function shiftRowToTz(row: ScheduleRow, tz: string): ScheduleRow {
  if (!row.startTime || tz === KST_TZ) return row;
  const startUtc = kstToUtcMs(row.sessionDate, row.startTime);
  const endHHMM = row.endTime ?? minToHHMM((Number(row.startTime.slice(0, 2)) * 60 + Number(row.startTime.slice(3, 5)) + row.durationMinutes) % (24 * 60));
  const endUtc = row.endTime != null || true ? kstToUtcMs(row.sessionDate, row.endTime ?? endHHMM) : startUtc;
  const s = utcToTzParts(startUtc, tz);
  const e = utcToTzParts(endUtc <= startUtc ? startUtc + row.durationMinutes * 60_000 : endUtc, tz);
  const sameDay = s.date === e.date;
  return {
    ...row,
    sessionDate: s.date,
    weekday: weekdayOfDate(s.date),
    startTime: minToHHMM(s.minutes),
    endTime: sameDay ? minToHHMM(e.minutes) : '24:00', // 자정 넘김 클램프(표시용)
  };
}

/** 목록 일괄 변환 — KST면 원본 그대로(참조 동일성 유지로 리렌더 최소화). */
export function shiftRowsToTz(rows: ScheduleRow[], tz: string): ScheduleRow[] {
  if (tz === KST_TZ) return rows;
  return rows.map((r) => shiftRowToTz(r, tz));
}

/** 특정 날짜의 KST 대비 시차(분) — 헤더 배지 "미국(동부) −13h" 표시용. */
export function tzOffsetFromKst(tz: string, dateISO: string): number {
  const utc = kstToUtcMs(dateISO, '12:00');
  const kst = utcToTzParts(utc, KST_TZ);
  const other = utcToTzParts(utc, tz);
  const dayDelta = Math.round((Date.parse(other.date) - Date.parse(kst.date)) / 86_400_000);
  return dayDelta * 24 * 60 + (other.minutes - kst.minutes);
}
