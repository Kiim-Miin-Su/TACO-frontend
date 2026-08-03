"use client";
import { useState } from "react";
import { ModalShell } from "@/components/ui";

// 반려 사유 공용 모달.
//  - mode="input": 사유를 적어 반려(제출 시 onSubmit(reason)).
//  - mode="view" : 적힌 사유를 읽기 전용으로 표시(강사가 확인).
export function ReasonModal({
  mode, title, initial = "", onClose, onSubmit, submitLabel = "반려", placeholder,
  minLength = 1, maxLength,
}: {
  mode: "input" | "view";
  title: string;
  initial?: string;
  onClose: () => void;
  onSubmit?: (reason: string) => void;
  /** [핫픽스 07-20] 제출 버튼 라벨 — 삭제 등 반려 외 용도 재사용(기본 '반려'). */
  submitLabel?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}) {
  const [reason, setReason] = useState(initial);
  const trimmedLength = reason.trim().length;
  return (
    <ModalShell
      title={title}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>{mode === "view" ? "닫기" : "취소"}</button>
          {mode === "input" && (
            <button className="btn btn-sm btn-danger" disabled={trimmedLength < minLength} onClick={() => onSubmit?.(reason.trim())}>{submitLabel}</button>
          )}
        </>
      )}
    >
      {mode === "input" ? (
        <textarea
          className="input min-h-[96px] w-full resize-y py-2"
          data-modal-autofocus="true"
          placeholder={placeholder ?? "반려 사유를 입력하세요 (강사에게 표시됩니다)"}
          aria-label="사유"
          minLength={minLength}
          maxLength={maxLength}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : (
        <div className="rounded-lg p-3 text-body whitespace-pre-wrap bg-canvas-subtle">
          {initial || <span className="text-fg-subtle">사유가 기재되지 않았습니다.</span>}
        </div>
      )}
    </ModalShell>
  );
}
