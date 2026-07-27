"use client";
// [TBO-70 2026-07-26] 공용 색상 선택기 — 단일 진실원 승격(종전 features/calendar/SessionEditFields
//  로컬 6색 → components/ui). 소비 3곳(세션 편집·스케줄 추가 모달·과목/수업 개설 폼)이 같은
//  컴포넌트를 쓴다(재사용 — 대표 지시). 구성:
//  · 프리셋 18색(lib/domain/colors.PRESET_COLORS — 기존 6색 하위 호환 + 확장 12색)
//  · '+' 버튼 = RGB 피커(<input type="color"> — 브라우저 네이티브: 클릭으로 RGB 선택)
//  · 커스텀 색은 최근 사용순(LRU·상한 12)으로 preferences 영속(taco.ui.customColors) —
//    다음 선택 때 스와치로 재노출·✕로 제거. 순수 로직은 lib/domain/colors(vitest 고정).
import { CUSTOM_COLORS_MAX, PRESET_COLORS, normalizeHexColor, pushCustomColor } from "@/lib/domain/colors";
import { preferenceKeys, stringArrayPreferenceCodec } from "@/lib/storage/preferences";
import { usePersistedState } from "@/lib/usePersistedState";

const EMPTY: string[] = [];
const CODEC = stringArrayPreferenceCodec();

function Swatch({ color, selected, onPick, title }: { color: string; selected: boolean; onPick: (c: string) => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(color)}
      className="w-6 h-6 rounded-full transition shrink-0"
      style={{ background: color, outline: selected ? "2px solid var(--color-fg)" : "1px solid var(--color-line)", outlineOffset: 1 }}
      aria-label={title ?? color}
      aria-pressed={selected}
      title={title ?? color}
    />
  );
}

export function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  const [custom, setCustom] = usePersistedState<string[]>(preferenceKeys.colorPickerCustomColors, EMPTY, CODEC);
  const selected = normalizeHexColor(value) ?? value;

  const pickCustom = (raw: string) => {
    const color = normalizeHexColor(raw);
    if (!color) return;
    setCustom((prev) => pushCustomColor(prev, color));
    onChange(color);
  };
  // 현재 값이 프리셋·커스텀 어디에도 없으면(과거 데이터·타 기기 선택) 스와치로 노출 — 선택 상태 시각화 보존.
  const orphan = selected && !PRESET_COLORS.includes(selected) && !custom.includes(selected) ? selected : null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <Swatch key={c} color={c} selected={selected === c} onPick={onChange} />
      ))}
      {custom.map((c) => (
        <span key={c} className="relative inline-flex group">
          <Swatch color={c} selected={selected === c} onPick={onChange} title={`${c} (커스텀)`} />
          <button
            type="button"
            onClick={() => setCustom((prev) => prev.filter((x) => x !== c))}
            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-3.5 h-3.5 items-center justify-center rounded-full bg-canvas border border-line text-[9px] leading-none text-fg-muted hover:text-danger"
            aria-label={`커스텀 색 ${c} 제거`}
            title="목록에서 제거(이미 저장된 일정 색은 유지)"
          >
            ✕
          </button>
        </span>
      ))}
      {orphan && <Swatch color={orphan} selected onPick={onChange} title={`${orphan} (현재 값)`} />}
      {/* '+' = RGB 클릭 선택(네이티브 피커). label로 input을 감싸 클릭 위임 — 커스텀 스타일 유지. */}
      <label
        className="w-6 h-6 rounded-full border border-dashed border-line text-fg-muted hover:text-fg hover:border-fg-muted flex items-center justify-center cursor-pointer text-body leading-none shrink-0"
        title={`색 직접 선택(RGB) — 최근 ${CUSTOM_COLORS_MAX}개 저장`}
        aria-label="색 직접 선택(RGB)"
      >
        +
        <input
          type="color"
          className="sr-only"
          value={normalizeHexColor(selected) ?? "#0969da"}
          onChange={(e) => pickCustom(e.target.value)}
        />
      </label>
    </div>
  );
}
