// 국가·시간대 변환 엔진 테스트 — KST 단일 진실원 → 표시 전용 변환의 정확성.
import { describe, expect, it } from 'vitest';
import type { ScheduleRow } from '@/types';
import { COUNTRIES, countryByCode, searchCountries, shiftRowToTz, shiftRowsToTz, tzOffsetFromKst, KST_TZ } from './tz';

const row = (over: Partial<ScheduleRow> = {}): ScheduleRow =>
  ({
    id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-07-01', startTime: '16:00', endTime: '17:30',
    durationMinutes: 90, status: 'scheduled', weekday: 3, courseName: 'SAT', subjectName: '영어',
    instructorName: '박지훈', studentIds: [1], studentNames: ['김서연'], ...over,
  }) as ScheduleRow;

describe('shiftRowToTz — KST 수업을 학생 국가 로컬 시간표로', () => {
  it('KST 7/1 16:00 수업 = 뉴욕(EDT, KST−13h) 7/1 03:00 — 같은 날짜의 새벽으로', () => {
    const r = shiftRowToTz(row(), 'America/New_York');
    expect(r.sessionDate).toBe('2026-07-01');
    expect(r.startTime).toBe('03:00');
    expect(r.endTime).toBe('04:30');
    expect(r.weekday).toBe(3); // 수요일 유지
  });

  it('KST 7/1 08:00 수업 = 뉴욕 6/30 19:00 — 날짜가 전날로 밀림(요일 재계산)', () => {
    const r = shiftRowToTz(row({ startTime: '08:00', endTime: '09:00' }), 'America/New_York');
    expect(r.sessionDate).toBe('2026-06-30');
    expect(r.startTime).toBe('19:00');
    expect(r.weekday).toBe(2); // 화요일
  });

  it('시드니(AEST, KST+1h): 7/1 23:30 수업 → 7/2 00:30 다음날로', () => {
    const r = shiftRowToTz(row({ startTime: '23:30', endTime: '23:59' }), 'Australia/Sydney');
    expect(r.sessionDate).toBe('2026-07-02');
    expect(r.startTime).toBe('00:30');
  });

  it('베트남(KST−2h): 16:00 → 14:00, 날짜 동일 — durationMinutes 원본 보존(시수 불변)', () => {
    const r = shiftRowToTz(row(), 'Asia/Ho_Chi_Minh');
    expect(r.startTime).toBe('14:00');
    expect(r.endTime).toBe('15:30');
    expect(r.durationMinutes).toBe(90);
  });

  it('자정 넘김 클램프: 로컬에서 시작·종료 날짜가 갈리면 종료=24:00(표시용)', () => {
    // 시드니 +1h: KST 23:00~00:30(익일) → 시드니 7/2 00:00~01:30 같은 날. 런던 −8h: 07:00~08:30 같은 날.
    // 케이스: 뉴질랜드 +3h, KST 22:00~23:30 → 7/2 01:00~02:30(같은 날) — 갈림 케이스는 종료가 다음날일 때
    const r = shiftRowToTz(row({ startTime: '10:00', endTime: '11:00' }), 'Pacific/Auckland'); // +3h → 13:00
    expect(r.endTime).toBe('14:00');
    const cross = shiftRowToTz(row({ sessionDate: '2026-07-01', startTime: '20:30', endTime: '21:30' }), 'Australia/Sydney');
    // +1h → 21:30~22:30 같은 날(클램프 미발동) — 클램프는 endTime이 다음날로 넘어갈 때만
    expect(cross.endTime).toBe('22:30');
  });

  it('[자정 크로스 실증] KST 수 12:30–14:00 → 뉴욕 화 23:30~익일 01:00 = 23:30–24:00 클램프·요일 재계산', () => {
    // 시드의 12:30 상담수업이 정확히 이 케이스 — 로컬에서 시작은 전날 심야, 종료는 자정 너머.
    const r = shiftRowToTz(row({ startTime: '12:30', endTime: '14:00' }), 'America/New_York');
    expect(r.sessionDate).toBe('2026-06-30'); // 수 → 화(전날)
    expect(r.weekday).toBe(2);
    expect(r.startTime).toBe('23:30');
    expect(r.endTime).toBe('24:00'); // 그리드는 24:00까지 — 익일 잔여는 tzOverflowEnd 배지로
    expect(r.tzOverflowEnd).toBe('01:00'); // "+1일 ~01:00" 잔여 배지(TBO-12 P0)
    expect(r.durationMinutes).toBe(90);
    // 자정을 안 넘는 변환에는 tzOverflowEnd 없음
    expect(shiftRowToTz(row(), 'Asia/Ho_Chi_Minh').tzOverflowEnd).toBeUndefined();
  });

  it('[자정 크로스] endTime 누락 시 UTC에서 duration 가산 — 모듈로 래핑 없이 동일 결과', () => {
    const r = shiftRowToTz(row({ startTime: '12:30', endTime: undefined as unknown as string, durationMinutes: 90 }), 'America/New_York');
    expect(r.startTime).toBe('23:30');
    expect(r.endTime).toBe('24:00');
  });

  it('KST 선택 시 원본 그대로(참조 동일 — 리렌더 최소화)', () => {
    const rows = [row()];
    expect(shiftRowsToTz(rows, KST_TZ)).toBe(rows);
  });
});

describe('tzOffsetFromKst — 헤더 시차 배지', () => {
  it('7월(서머타임): 뉴욕 −13h, 런던 −8h, 시드니 +1h, 베트남 −2h', () => {
    expect(tzOffsetFromKst('America/New_York', '2026-07-01')).toBe(-13 * 60);
    expect(tzOffsetFromKst('Europe/London', '2026-07-01')).toBe(-8 * 60);
    expect(tzOffsetFromKst('Australia/Sydney', '2026-07-01')).toBe(60);
    expect(tzOffsetFromKst('Asia/Ho_Chi_Minh', '2026-07-01')).toBe(-120);
  });
  it('1월(표준시): 뉴욕 −14h, 시드니 +2h — DST 자동 반영', () => {
    expect(tzOffsetFromKst('America/New_York', '2026-01-15')).toBe(-14 * 60);
    expect(tzOffsetFromKst('Australia/Sydney', '2026-01-15')).toBe(120);
  });
});

describe('searchCountries — 자동완성(한글·영문·코드)', () => {
  it('부분일치·대소문자 무시·상한', () => {
    expect(searchCountries('미국').map((c) => c.code)).toEqual(['US', 'US-W']);
    expect(searchCountries('viet')[0].code).toBe('VN');
    expect(searchCountries('us')[0].code).toBe('US');
    expect(searchCountries('')).toEqual([]);
  });
  it('countryByCode·목록 무결성(코드 유일·tz 유효 형식)', () => {
    expect(countryByCode('vn')?.tz).toBe('Asia/Ho_Chi_Minh');
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) expect(c.tz).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
  });
});
