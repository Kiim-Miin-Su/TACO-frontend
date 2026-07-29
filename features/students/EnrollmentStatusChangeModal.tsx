"use client";

import { useState } from "react";
import type { Enrollment, EnrollmentStatus, UpdateEnrollmentInput } from "@kms545487/contracts";
import { ModalShell } from "@/components/ui";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/domain/enrollments";
import { useUpdateEnrollment } from "@/lib/queries";
import { apiErrorMessage } from "@/lib/api-error";

const STATUSES = ["active", "paused", "completed", "canceled"] as const satisfies readonly EnrollmentStatus[];

export function EnrollmentStatusChangeModal({
  enrollment,
  courseName,
  onClose,
}: {
  enrollment: Enrollment;
  courseName: string;
  onClose: () => void;
}) {
  const update = useUpdateEnrollment();
  const [status, setStatus] = useState<EnrollmentStatus>(enrollment.status);
  const [startDate, setStartDate] = useState(enrollment.startDate ?? "");
  const [endDate, setEndDate] = useState(enrollment.endDate ?? "");
  const [totalSessions, setTotalSessions] = useState(
    enrollment.totalSessions == null ? "" : String(enrollment.totalSessions),
  );
  const [memo, setMemo] = useState(enrollment.memo ?? "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  const unchanged =
    status === enrollment.status
    && startDate === (enrollment.startDate ?? "")
    && endDate === (enrollment.endDate ?? "")
    && totalSessions === (enrollment.totalSessions == null ? "" : String(enrollment.totalSessions))
    && memo === (enrollment.memo ?? "");
  const invalid =
    unchanged
    || reason.trim().length < 2
    || (startDate !== "" && endDate !== "" && endDate < startDate)
    || (totalSessions !== "" && (!Number.isInteger(Number(totalSessions)) || Number(totalSessions) < 0));

  const save = () => {
    if (invalid) return;
    setMessage("");
    const patch: UpdateEnrollmentInput = {
      status,
      startDate: startDate || null,
      endDate: endDate || null,
      totalSessions: totalSessions === "" ? null : Number(totalSessions),
      memo: memo.trim() || null,
      reason: reason.trim(),
    };
    update.mutate(
      { id: enrollment.id, patch },
      {
        onSuccess: onClose,
        onError: (error) => setMessage(apiErrorMessage(error, "수강 상태를 변경하지 못했습니다.")),
      },
    );
  };

  return (
    <ModalShell
      title={`${courseName} 수강 상태 변경`}
      size="md"
      onClose={onClose}
      bodyClassName="space-y-4"
      footer={(
        <>
          <button className="btn btn-sm" disabled={update.isPending} onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={update.isPending || invalid} onClick={save}>
            {update.isPending ? "DB 확인 중…" : "변경 저장"}
          </button>
        </>
      )}
    >
      <p className="text-caption text-fg-muted">
        상태를 종료해도 기존 수업·출결·리포트 이력은 보존됩니다. 비활성 수강은 새 수업의 기본 명단에서 제외됩니다.
      </p>
      <fieldset>
        <legend className="text-caption font-medium text-fg-muted mb-2">수강 상태</legend>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                status === value ? "border-accent bg-accent-subtle" : "border-line-muted"
              }`}
            >
              <input type="radio" name="enrollment-status" checked={status === value} onChange={() => setStatus(value)} />
              <span className="font-medium">{ENROLLMENT_STATUS_LABEL[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-caption font-medium text-fg-muted mb-1">시작일</span>
          <input className="input w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="block">
          <span className="block text-caption font-medium text-fg-muted mb-1">종료일</span>
          <input className="input w-full" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">총 회차</span>
        <input
          className="input w-full"
          type="number"
          min={0}
          max={1000}
          value={totalSessions}
          onChange={(event) => setTotalSessions(event.target.value)}
        />
        <span className="block text-micro text-fg-subtle mt-1">
          이미 완료된 {enrollment.completedSessions ?? 0}회보다 작게 저장할 수 없습니다.
        </span>
      </label>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">수강 메모</span>
        <textarea className="input w-full min-h-20 resize-y" maxLength={500} value={memo} onChange={(event) => setMemo(event.target.value)} />
      </label>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">변경 사유 *</span>
        <textarea
          className="input w-full min-h-20 resize-y"
          data-modal-autofocus="true"
          maxLength={500}
          placeholder="보호자 요청, 수강 완료 등 이력에 남길 사유"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {startDate && endDate && endDate < startDate && <p className="text-caption text-danger">종료일은 시작일보다 빠를 수 없습니다.</p>}
      {message && <p className="text-caption text-danger" role="alert">{message}</p>}
    </ModalShell>
  );
}
