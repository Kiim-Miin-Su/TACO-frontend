'use client';
import { useState } from 'react';

// Notion식 라벨 입력: 기존 값 추천 + 없으면 새로 만들기
export function Combobox({
  value,
  onChange,
  suggestions,
  placeholder,
  suggestionLabel = '사용된 라벨',
  createLabel = '새로 만들기',
  inputName,
  required,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  suggestionLabel?: string;
  createLabel?: string;
  inputName?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  const exact = suggestions.some((s) => s.toLowerCase() === q);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <input
        className="input"
        name={inputName}
        value={value}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
      />
      {open && (filtered.length > 0 || (!!q && !exact)) && (
        <div className="absolute z-20 mt-1 w-full card overflow-hidden" role="listbox" style={{ boxShadow: 'var(--shadow-overlay)' }}>
          {filtered.length > 0 && (
            <div className="px-3 py-1 text-micro text-fg-subtle">{suggestionLabel}</div>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s.toLowerCase() === q}
              className="block w-full text-left px-3 py-1.5 text-body hover:bg-canvas-subtle"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
          {!!q && !exact && (
            <button
              type="button"
              role="option"
              aria-selected="false"
              className="block w-full text-left px-3 py-1.5 text-body text-accent hover:bg-canvas-subtle border-t border-line-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen(false)}
            >
              + “{value}” {createLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
