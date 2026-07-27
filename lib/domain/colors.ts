// [TBO-70 2026-07-26] 색상 선택 도메인 — 공용 ColorPicker(components/ui)의 순수 로직 단일 소스.
//  대표 지시: "색상 선택이 너무 한정적 — + 버튼으로 추가, RGB 기반 클릭 선택".
//  · PRESET_COLORS: 피커 프리셋 정본(기존 PALETTE 6색 유지 + 확장 12색). ⚠ lib/domain/lantiv의
//    PALETTE는 **해시 배색 진실원**(리소스·강사 자동 배색 — BE resources와 동형)이라 여기 확장을
//    거기에 합치면 기존 자동 배색이 전부 바뀐다 → 피커 프리셋은 별도 정본으로 분리(의도).
//  · 커스텀 색: RGB 피커(<input type="color">)로 추가 — 최근 사용순(LRU)·상한, preferences 영속.
import { PALETTE } from './lantiv';

/** 피커 프리셋 — 앞 6색은 기존 PALETTE(하위 호환: 기존 세션·코스 색이 프리셋에 그대로 존재). */
export const PRESET_COLORS: readonly string[] = [
  ...PALETTE, // '#0969da' '#1a7f37' '#8250df' '#bf3989' '#9a6700' '#1b7c83'
  '#cf222e', // red
  '#e16f24', // orange
  '#d4a72c', // amber
  '#2da44e', // green
  '#00a0b0', // teal
  '#54aeff', // sky
  '#6639ba', // violet
  '#e85aad', // pink
  '#b35900', // brown
  '#6e7781', // gray
  '#24292f', // charcoal
  '#ffd33d', // yellow
];

export const CUSTOM_COLORS_MAX = 12;

/** '#rrggbb' 소문자 정규화 — <input type="color"> 값·수기 입력 방어. 무효면 null(조용한 오저장 금지). */
export const normalizeHexColor = (value: string | null | undefined): string | null => {
  const raw = (value ?? '').trim().toLowerCase();
  const m = /^#?([0-9a-f]{6})$/.exec(raw);
  return m ? `#${m[1]}` : null;
};

/** 커스텀 색 추가 — 정규화·프리셋 중복 제외·최근 사용순(맨 앞)·상한 초과 시 가장 오래된 것 제거. */
export const pushCustomColor = (list: readonly string[], value: string): string[] => {
  const color = normalizeHexColor(value);
  if (!color || PRESET_COLORS.includes(color)) return [...list];
  return [color, ...list.filter((c) => c !== color)].slice(0, CUSTOM_COLORS_MAX);
};
