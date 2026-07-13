"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Modal 계열 — window.prompt/confirm 대체 (DESIGN.md §5).
 * 폭 3단: sm 400 / md 560 / lg 720 (+ max-w-[95vw]) · 높이 max-h-[85vh] 본문 스크롤(§2.4).
 * 금지: window.prompt / window.confirm / window.alert 신규 사용, 모달 안에서 모달 열기.
 */

const widths = { sm: "w-[400px]", md: "w-[560px]", lg: "w-[720px]" } as const;
type ModalSize = keyof typeof widths;

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalShell({
  title,
  children,
  footer,
  onClose,
  size = "sm",
  bodyClassName = "",
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: ModalSize;
  bodyClassName?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-modal-autofocus]") ?? panel?.querySelector<HTMLElement>(focusableSelector);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === firstElement || !panel.contains(document.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const restoreFocus = restoreFocusRef.current;
      window.setTimeout(() => restoreFocus?.focus(), 0);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[55] grid place-items-center bg-black/35 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`card card-pad ${widths[size]} max-w-[95vw] max-h-[85vh] flex flex-col gap-3`}
      >
        <div id={titleId} className="font-semibold shrink-0">{title}</div>
        <div className={`min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && <div className="flex justify-end gap-2 pt-1 shrink-0">{footer}</div>}
      </div>
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
    <ModalShell
      title={title}
      onClose={onClose}
      bodyClassName="space-y-3"
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={invalid} onClick={submit}>{submitLabel}</button>
        </>
      )}
    >
        {fields.map((f, i) => (
          <label key={f.name} className="block">
            <span className="block text-caption font-medium text-fg-muted mb-1">{f.label}{f.required ? " *" : ""}</span>
            <input
              className="input"
              data-modal-autofocus={i === 0 ? "true" : undefined}
              inputMode={f.type === "number" ? "numeric" : undefined}
              placeholder={f.placeholder}
              value={values[f.name]}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            {f.hint && <span className="block text-micro text-fg-subtle mt-1">{f.hint}</span>}
          </label>
        ))}
    </ModalShell>
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
    <ModalShell
      title={title}
      onClose={onClose}
      bodyClassName="text-body text-fg-muted"
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`} data-modal-autofocus="true" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      {message}
    </ModalShell>
  );
}
