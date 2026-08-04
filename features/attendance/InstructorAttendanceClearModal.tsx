"use client";

import { ReasonModal } from "@/components/ReasonModal";

export function InstructorAttendanceClearModal({
  sessionId,
  onClose,
  onSubmit,
}: {
  sessionId: number | null;
  onClose: () => void;
  onSubmit: (sessionId: number, reason: string) => void;
}) {
  if (sessionId == null) return null;
  return (
    <ReasonModal
      mode="input"
      title="강사 출결 미선택 복귀"
      submitLabel="변경"
      minLength={2}
      placeholder="변경 사유를 입력하세요"
      onClose={onClose}
      onSubmit={(reason) => onSubmit(sessionId, reason)}
    />
  );
}
