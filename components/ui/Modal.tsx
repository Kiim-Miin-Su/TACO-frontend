"use client";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Modal 계열 — window.prompt/confirm 대체 (DESIGN.md §5).
 * 폭 3단: sm 400 / md 560 / lg 720 (+ max-w-[95vw]).
 * 금지: window.prompt / window.confirm / window.alert 신규 사용.
 */

const widths = { sm: "w-[400px]", md: "w-[560px]", lg: "w-[720px]" } as const;

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // Escape로 닫기 — 팝오버와 달리 모달은 키보드 탈출 지원
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-black/35" onClick={onClose}>
      {children}
    </div>
  );
}

export type PromptField = {
  name: string;
  label: string;
  /** text(기본) | number — number는 숫자 외 문자 제거 후 검증 */
  type?: "text" | "number";
  initial?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
};

/**
 * PromptModal — 값 입력 모달(window.prompt 대체).
 * 여러 필드를 한 화면에서 받는다(예: 급여 수정 = 금액 + 사유).
 */
export function PromptModal({
  title, fields, submitLabel = "저장", onClose, onSubmit,
}: {
  title: string;
  fields: PromptField[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])),
  );
  const invalid = fields.some((f) => {
    const v = (values[f.name] ?? "").trim();
    if (f.required && !v) return true;
    if (f.type === "number" && v && !Number.isFinite(Number(v.replace(/[^\d.-]/g, "")))) return true;
    return false;
  });
  const submit = () => {
    if (invalid) return;
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      out[f.name] = f.type === "number" ? v.replace(/[^\d.-]/g, "") : v;
    }
    onSubmit(out);
  };
  return (
    <Overlay onClose={onClose}>
      <div className={`card card-pad ${widths.sm} max-w-[95vw] space-y-3`} onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{title}</div>
        {fields.map((f, i) => (
          <label key={f.name} className="block">
            <span className="block text-caption font-medium text-fg-muted mb-1">{f.label}{f.required ? " *" : ""}</span>
            <input
              className="input"
              autoFocus={i === 0}
              inputMode={f.type === "number" ? "numeric" : undefined}
              placeholder={f.placeholder}
              value={values[f.name]}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            {f.hint && <span className="block text-micro text-fg-subtle mt-1">{f.hint}</span>}
          </label>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={invalid} onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </Overlay>
  );
}

/**
 * ConfirmModal — 확인 모달(window.confirm 대체).
 * 파괴적 액션은 danger 톤 버튼으로.
 */
export function ConfirmModal({
  title, message, confirmLabel = "확인", danger, onClose, onConfirm,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /** 파괴적 액션(퇴원 처리 등) — 버튼을 danger 톤으로 */
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className={`card card-pad ${widths.sm} max-w-[95vw] space-y-3`} onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{title}</div>
        <div className="text-body text-fg-muted">{message}</div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`} autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
