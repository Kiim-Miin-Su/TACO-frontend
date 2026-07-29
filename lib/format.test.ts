// 공용 표시 유틸은 SSR/CSR 하이드레이션 결정을 위해 locale에 의존하지 않는다.
import { describe, expect, it } from 'vitest';
import { dateOnly, kstDateTime, shortDate, won } from '@/lib/format';

describe('format', () => {
  it('won — 천 단위 콤마, 반올림, 0·음수 처리', () => {
    expect(won(0)).toBe('₩0');
    expect(won(1000)).toBe('₩1,000');
    expect(won(1234567)).toBe('₩1,234,567');
    expect(won(180000)).toBe('₩180,000');
    expect(won(999.6)).toBe('₩1,000');
    expect(won(-45000)).toBe('₩-45,000');
  });

  it('shortDate — YYYY-MM-DD·ISO datetime 모두 MM/DD, 형식 밖 입력은 원문', () => {
    expect(shortDate('2026-07-24')).toBe('07/24');
    expect(shortDate('2026-01-05T09:30:00.000Z')).toBe('01/05');
    expect(shortDate('not-a-date')).toBe('not-a-date');
  });

  it('dateOnly — timestamptz ISO를 YYYY-MM-DD로, 빈 값은 em dash', () => {
    expect(dateOnly('2026-07-24T13:00:00.000Z')).toBe('2026-07-24');
    expect(dateOnly('2026-07-24')).toBe('2026-07-24');
    expect(dateOnly(null)).toBe('—');
    expect(dateOnly(undefined)).toBe('—');
    expect(dateOnly('')).toBe('—');
  });

  it('renders an ISO instant in deterministic KST', () => {
    expect(kstDateTime('2026-07-29T12:00:00.000Z')).toBe('2026-07-29 21:00 KST');
  });

  it('returns malformed input unchanged', () => {
    expect(kstDateTime('not-a-date')).toBe('not-a-date');
  });
});
