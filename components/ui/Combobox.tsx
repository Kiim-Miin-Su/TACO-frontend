'use client';
import { useState } from 'react';

// Notion식 라벨 입력: 기존 값 추천 + 없으면 새로 만들기
export function Combobox({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  const exact = suggestions.some((s) => s.toLowerCase() === q);

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (filtered.length > 0 || (!!q && !exact)) && (
        <div className="absolute z-20 mt-1 w-full card overflow-hidden" style={{ boxShadow: 'var(--shadow-overlay)' }}>
          {filtered.length > 0 && (
            <div className="px-3 py-1 text-micro text-fg-subtle">사용된 라벨</div>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-body hover:bg-canvas-subtle"
              onMouseDown={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
          {!!q && !exact && (
            <button
              type="button"
              className="block w-full text-left px-3 py-1.5 text-body text-accent hover:bg-canvas-subtle border-t border-line-muted"
              onMouseDown={() => setOpen(false)}
            >
              + “{value}” 새로 만들기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
