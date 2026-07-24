// [TBO-58 P2 2026-07-24] format 유틸 테스트 — SSR/CSR 하이드레이션 결정성이 계약(로케일 미의존).
//  금액·날짜 표기는 전 화면 공용이라 회귀 시 파급이 넓다(검증③ FE 유틸 무테스트 갭).
import { describe, expect, it } from 'vitest';
import { won, shortDate, dateOnly } from '@/lib/format';

describe('format', () => {
  it('won — 천 단위 콤마, 반올림, 0·음수 처리', () => {
    expect(won(0)).toBe('₩0');
    expect(won(1000)).toBe('₩1,000');
    expect(won(1234567)).toBe('₩1,234,567');
    expect(won(180000)).toBe('₩180,000');
    expect(won(999.6)).toBe('₩1,000'); // 반올림 — 원 단위 표기
    expect(won(-45000)).toBe('₩-45,000'); // 환불·차감 표기(부호 유지)
  });

  it('shortDate — YYYY-MM-DD·ISO datetime 모두 MM/DD, 형식 밖 입력은 원문', () => {
    expect(shortDate('2026-07-24')).toBe('07/24');
    expect(shortDate('2026-01-05T09:30:00.000Z')).toBe('01/05'); // datetime도 날짜부만
    expect(shortDate('not-a-date')).toBe('not-a-date'); // 방어 — 깨진 값은 그대로(백지화 금지)
  });

  it('dateOnly — timestamptz ISO를 YYYY-MM-DD로, 빈 값은 em dash', () => {
    expect(dateOnly('2026-07-24T13:00:00.000Z')).toBe('2026-07-24');
    expect(dateOnly('2026-07-24')).toBe('2026-07-24');
    expect(dateOnly(null)).toBe('—');
    expect(dateOnly(undefined)).toBe('—');
    expect(dateOnly('')).toBe('—');
  });
});
