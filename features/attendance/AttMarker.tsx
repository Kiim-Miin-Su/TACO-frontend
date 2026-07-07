"use client";
// [req4 2026-07-07] 출결 마킹 버튼(원클릭 저장) — 강사·학생 출결 공용(제네릭 상태).
//  · 미표시: 버튼 4종 즉시 노출 → 한 번 클릭 = 저장.
//  · 값 있음: 현재값 배지 + '수정' 버튼 → 눌러야 버튼 재활성(오조작 방지).
//  · 권한: canEdit=false면 읽기 전용 배지(ROLE 관리는 호출부에서 — 매니저만 canEdit).
import { useState } from "react";

export type MarkOption<T extends string> = { value: T; label: string; tone: string };

export function AttMarker<T extends string>({
  value, options, onMark, onClear, canEdit, pending,
}: {
  value?: T;
  options: MarkOption<T>[];
  onMark: (s: T) => void;
  onClear?: () => void; // 미표시로 초기화(선택)
  canEdit: boolean;
  pending?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const cur = options.find((o) => o.value === value);

  const badge = cur ? (
    <span className="badge text-micro" style={{ background: cur.tone, color: "#fff" }}>{cur.label}</span>
  ) : (
    <span className="text-fg-subtle text-caption">미표시</span>
  );

  if (!canEdit) return badge; // 읽기 전용

  // 값이 있고 편집 중이 아니면 배지 + '수정'(눌러야 버튼 활성)
  if (value && !editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {badge}
        <button type="button" className="btn btn-sm h-6 px-1.5 text-micro" onClick={() => setEditing(true)}>수정</button>
      </span>
    );
  }
  // 미표시이거나 편집 중 → 버튼 4종(원클릭 저장)
  const pick = (s: T) => { onMark(s); setEditing(false); };
  return (
    <span className="inline-flex items-center gap-0.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          className="h-6 px-1.5 rounded text-micro font-semibold disabled:opacity-40"
          style={{ background: value === o.value ? o.tone : "var(--color-canvas-subtle)", color: value === o.value ? "#fff" : "var(--color-fg-muted)", border: "1px solid var(--color-line)" }}
          title={o.label}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
      {value && onClear && (
        <button type="button" className="btn btn-sm h-6 px-1 text-micro" title="미표시로 초기화" onClick={() => { onClear(); setEditing(false); }}>지움</button>
      )}
      {value && (
        <button type="button" className="btn btn-sm h-6 px-1 text-micro" title="취소" onClick={() => setEditing(false)}>✕</button>
      )}
    </span>
  );
}

// 공용 옵션(색·라벨) — 단일 소스.
export const INSTRUCTOR_ATT_OPTIONS: MarkOption<"present" | "late" | "absent" | "makeup">[] = [
  { value: "present", label: "출석", tone: "var(--color-success)" },
  { value: "late", label: "지각", tone: "var(--color-attention)" },
  { value: "absent", label: "결석", tone: "var(--color-danger)" },
  { value: "makeup", label: "보강", tone: "var(--color-fg-muted)" },
];
export const STUDENT_ATT_OPTIONS: MarkOption<"present" | "late" | "absent" | "excused">[] = [
  { value: "present", label: "출석", tone: "var(--color-success)" },
  { value: "late", label: "지각", tone: "var(--color-attention)" },
  { value: "absent", label: "결석", tone: "var(--color-danger)" },
  { value: "excused", label: "공결", tone: "var(--color-fg-subtle)" },
];
