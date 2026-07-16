// [B6 C1 2026-07-16] ScheduleCalendar 인라인 사설 모달 → ModalShell 이관 + 파일 분리(E1 + EP9 선행 절단).
//  반복 일정 변경/삭제 범위(this / this_and_following / all) 선택 — 드래그·리사이즈·삭제 공용.
"use client";
import { ModalShell } from "@/components/ui";

export function RecurrencePrompt({
  label,
  onPick,
  onCancel,
}: {
  label: string;
  onPick: (scope: "this" | "this_and_following" | "all") => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell
      title="반복 일정 수정"
      onClose={onCancel}
      size="sm"
      bodyClassName="space-y-3"
      footer={<button className="btn btn-sm" onClick={onCancel}>취소</button>}
    >
      <p className="text-body text-fg-muted">{label} — 어디까지 적용할까요?</p>
      <div className="grid gap-2">
        <button className="btn" data-modal-autofocus="true" onClick={() => onPick("this")}>
          이 일정만
        </button>
        <button className="btn" onClick={() => onPick("this_and_following")}>
          이 일정 및 이후 전부
        </button>
        <button className="btn" onClick={() => onPick("all")}>
          시리즈 전체
        </button>
      </div>
    </ModalShell>
  );
}
