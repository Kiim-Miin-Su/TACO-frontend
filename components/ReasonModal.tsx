"use client";
import { useState } from "react";

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
    <div className="fixed inset-0 z-[55] grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[400px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{title}</div>
        {mode === "input" ? (
          <textarea
            className="input min-h-[96px] py-2"
            autoFocus
            placeholder="반려 사유를 입력하세요 (강사에게 표시됩니다)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : (
          <div className="rounded-lg p-3 text-[13px] whitespace-pre-wrap" style={{ background: "var(--color-canvas-subtle)" }}>
            {initial || <span className="text-fg-subtle">사유가 기재되지 않았습니다.</span>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-sm" onClick={onClose}>{mode === "view" ? "닫기" : "취소"}</button>
          {mode === "input" && (
            <button className="btn btn-sm btn-danger" disabled={!reason.trim()} onClick={() => onSubmit?.(reason.trim())}>반려</button>
          )}
        </div>
      </div>
    </div>
  );
}
