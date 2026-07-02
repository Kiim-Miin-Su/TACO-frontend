"use client";
// [참조/처리] 국가 자동완성 인풋(피드백 2026-07-02) — 해외 학생 시간표(시차 뷰)·국가 필터 진입점.
//  - 대표 국가 목록(lib/domain/tz.COUNTRIES)에서 한글/영문/코드 부분일치 자동완성.
//  - 최근 검색: localStorage('taco.recentCountries', 최대 5) — 포커스 시 우선 노출.
//  - 선택 결과는 CountryInfo(코드·IANA tz) 그대로 부모에 전달 — tz 계산은 lib/domain/tz 단일 소스.
import { useEffect, useRef, useState } from "react";
import { COUNTRIES, countryByCode, searchCountries, type CountryInfo } from "@/lib/domain/tz";

const RECENT_KEY = "taco.recentCountries";

function loadRecent(): CountryInfo[] {
  try {
    const codes: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return codes.map((c) => COUNTRIES.find((x) => x.code === c)).filter((x): x is CountryInfo => !!x);
  } catch {
    return [];
  }
}
function pushRecent(code: string) {
  try {
    const codes: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...codes.filter((c) => c !== code)].slice(0, 5)));
  } catch { /* storage 불가 환경 무시 */ }
}

/** 국가 표시(국기+이름/코드) 공용 — 학생 테이블·필터 칩 등에서 재사용(감사 M9: 표시 로직 단일화). */
export function CountryBadge({ code, showName }: { code?: string; showName?: boolean }) {
  const c = countryByCode(code ?? "KR");
  if (!c) return <span className="mono text-fg-muted">{code}</span>;
  return (
    <span title={`${c.name} · ${c.tz}`}>
      {c.flag} <span className="text-[12px] text-fg-muted">{showName ? c.name : c.code}</span>
    </span>
  );
}

export function CountryInput({
  value, onSelect, compact, placeholder,
}: {
  value: CountryInfo | null;
  onSelect: (c: CountryInfo | null) => void;
  compact?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);

  const results = q.trim() ? searchCountries(q) : loadRecent();
  const pick = (c: CountryInfo) => { pushRecent(c.code); onSelect(c); setQ(""); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      {value ? (
        <span className={`badge badge-accent inline-flex items-center gap-1 ${compact ? "text-[11px]" : ""}`} title={`${value.name} · ${value.tz}`}>
          {value.flag} {value.name}
          <button className="opacity-70 hover:opacity-100" onClick={() => onSelect(null)} aria-label="국가 해제">✕</button>
        </span>
      ) : (
        <input
          className={`input ${compact ? "h-7 w-[120px] text-[11px]" : "h-8 w-[150px] text-[12px]"}`}
          placeholder={placeholder ?? "🌐 국가 (시차 뷰)"}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        />
      )}
      {open && !value && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-40 card shadow-lg w-56 overflow-hidden">
          {!q.trim() && <div className="px-2 pt-1.5 text-[10px] text-fg-subtle">최근 검색</div>}
          <div className="p-1 max-h-56 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.code}
                className="w-full flex items-center gap-2 px-2 h-8 rounded text-[13px] hover:bg-canvas-subtle text-left"
                onClick={() => pick(c)}
              >
                <span>{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-[10px] text-fg-subtle mono">{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
