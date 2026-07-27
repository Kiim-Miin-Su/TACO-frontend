import { describe, it, expect } from 'vitest';
import { CUSTOM_COLORS_MAX, PRESET_COLORS, normalizeHexColor, pushCustomColor } from './colors';
import { PALETTE } from './lantiv';

// [TBO-70] 색상 선택 도메인 — 공용 ColorPicker 순수 로직 고정.
describe('colors — 피커 프리셋·정규화·커스텀 LRU', () => {
  it('프리셋 앞 6색 = 기존 PALETTE(하위 호환 — 기존 세션·코스 색이 프리셋에 존재)', () => {
    expect(PRESET_COLORS.slice(0, PALETTE.length)).toEqual(PALETTE);
    expect(new Set(PRESET_COLORS).size).toBe(PRESET_COLORS.length); // 중복 없음
  });
  it('normalizeHexColor — #rrggbb 소문자 정규화, 무효는 null(조용한 오저장 금지)', () => {
    expect(normalizeHexColor('#A1B2C3')).toBe('#a1b2c3');
    expect(normalizeHexColor('a1b2c3')).toBe('#a1b2c3');
    expect(normalizeHexColor(' #0969da ')).toBe('#0969da');
    expect(normalizeHexColor('#abc')).toBeNull(); // 3자리 축약 미지원(입력원이 6자리 고정)
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });
  it('pushCustomColor — 맨 앞 삽입·중복 승격·프리셋 중복 제외·상한 LRU', () => {
    expect(pushCustomColor([], '#111111')).toEqual(['#111111']);
    expect(pushCustomColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']); // 재사용=승격
    expect(pushCustomColor(['#111111'], PALETTE[0])).toEqual(['#111111']); // 프리셋은 커스텀에 안 쌓임
    expect(pushCustomColor(['#111111'], 'not-a-color')).toEqual(['#111111']); // 무효 무시
    const full = Array.from({ length: CUSTOM_COLORS_MAX }, (_, i) => `#1111${String(10 + i)}`);
    const pushed = pushCustomColor(full, '#999999');
    expect(pushed).toHaveLength(CUSTOM_COLORS_MAX); // 상한 유지
    expect(pushed[0]).toBe('#999999'); // 새 색이 맨 앞
    expect(pushed).not.toContain(full[CUSTOM_COLORS_MAX - 1]); // 가장 오래된 것 제거
  });
});
