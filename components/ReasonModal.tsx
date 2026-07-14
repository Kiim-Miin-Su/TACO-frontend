"use client";
import { useState } from "react";
import { ModalShell } from "@/components/ui";

// 반려 사유 공용 모달.
//  - mode="input": 사유를 적어 반려(제출 시 onSubmit(reason)).
//  - mode="view" : 적힌 사유를 읽기 전용으로 표시(강사가 확인).
export function ReasonModal({
  mode, title, initial = "", onClose, onSubmit,
}: {
  mode: "input" | "view";
  title: string;
  initial?: string;
  onClose: () => void;
  onSubmit?: (reason: string) => void;
}) {
  const [reason, setReason] = useState(initial);
  return (
    <ModalShell
      title={title}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>{mode === "view" ? "닫기" : "취소"}</button>
          {mode === "input" && (
            <button className="btn btn-sm btn-danger" disabled={!reason.trim()} onClick={() => onSubmit?.(reason.trim())}>반려</button>
          )}
        </>
      )}
    >
      {mode === "input" ? (
        <textarea
          className="input min-h-[96px] w-full resize-y py-2"
          data-modal-autofocus="true"
          placeholder="반려 사유를 입력하세요 (강사에게 표시됩니다)"
          aria-label="반려 사유"
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
