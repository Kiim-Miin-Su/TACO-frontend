"use client";

import { useMemo, useState } from "react";
import type { StaffAttendanceRecord, StaffAttendanceStatus, UpsertStaffAttendanceInput } from "@kms545487/contracts";
import { Field, ModalShell } from "@/components/ui";
import { apiErrorMessage } from "@/lib/api-error";
import { STAFF_ATTENDANCE_LABEL } from "@/lib/domain/staff-attendance";
import { useUpsertStaffAttendance } from "@/lib/queries";

type InstructorOption = { id: number; name: string };

const STATUSES = Object.keys(STAFF_ATTENDANCE_LABEL) as StaffAttendanceStatus[];

const instantToKstTime = (value?: string | null): string => {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed + 9 * 60 * 60 * 1000).toISOString().slice(11, 16) : "";
};

const kstInstant = (date: string, time: string): string | null =>
  time ? new Date(`${date}T${time}:00+09:00`).toISOString() : null;

export function StaffAttendanceRecordModal({
  instructors,
  record,
  defaultDate,
  onClose,
  onSaved,
  onDelete,
}: {
  instructors: InstructorOption[];
  record?: StaffAttendanceRecord;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (record: StaffAttendanceRecord) => void;
}) {
  const upsert = useUpsertStaffAttendance();
  const [staffId, setStaffId] = useState(String(record?.staffId ?? instructors[0]?.id ?? ""));
  const [workDate, setWorkDate] = useState(record?.workDate ?? defaultDate);
  const [status, setStatus] = useState<StaffAttendanceStatus>(record?.status ?? "present");
  const [checkInTime, setCheckInTime] = useState(instantToKstTime(record?.checkInAt));
  const [checkOutTime, setCheckOutTime] = useState(instantToKstTime(record?.checkOutAt));
  const [memo, setMemo] = useState(record?.memo ?? "");
  const [error, setError] = useState("");
  const timePairValid = (!checkInTime && !checkOutTime) || (!!checkInTime && !!checkOutTime && checkOutTime > checkInTime);
  const valid = Number(staffId) > 0 && !!workDate && timePairValid;
  const title = useMemo(() => record ? "근무·휴가 기록 수정" : "근무·휴가 기록 추가", [record]);

  const submit = async () => {
    if (!valid) return;
    setError("");
    const input: UpsertStaffAttendanceInput = {
      staffId: Number(staffId),
      workDate,
      status,
      checkInAt: kstInstant(workDate, checkInTime),
      checkOutAt: kstInstant(workDate, checkOutTime),
      memo: memo.trim() || null,
    };
    try {
      await upsert.mutateAsync(input);
      onSaved();
    } catch (caught) {
      setError(apiErrorMessage(caught, "근무·휴가 기록을 저장하지 못했습니다."));
    }
  };

  return (
    <ModalShell
      title={title}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          {record && onDelete && <button type="button" className="btn btn-sm btn-danger mr-auto" onClick={() => onDelete(record)}>삭제</button>}
          <button type="button" className="btn btn-sm" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!valid || upsert.isPending} onClick={submit}>
            {upsert.isPending ? "저장 중" : "저장"}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="강사 *">
          <select className="input w-full" value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={!!record}>
            {instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="업무일 *">
            <input type="date" className="input w-full" value={workDate} onChange={(event) => setWorkDate(event.target.value)} disabled={!!record} />
          </Field>
          <Field label="상태 *">
            <select className="input w-full" value={status} onChange={(event) => {
              const next = event.target.value as StaffAttendanceStatus;
              setStatus(next);
              if (!["present", "late", "remote_work"].includes(next)) {
                setCheckInTime("");
                setCheckOutTime("");
              }
            }}>
              {STATUSES.map((value) => <option key={value} value={value}>{STAFF_ATTENDANCE_LABEL[value]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="출근 시각" hint="두 시각은 함께 입력합니다.">
            <input type="time" className="input w-full" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} />
          </Field>
          <Field label="퇴근 시각" error={!timePairValid ? "퇴근은 출근 뒤여야 하며 두 시각을 함께 입력해야 합니다." : undefined}>
            <input type="time" className="input w-full" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} />
          </Field>
        </div>
        <Field label="메모">
          <textarea className="input min-h-20 w-full resize-y py-2" maxLength={500} value={memo} onChange={(event) => setMemo(event.target.value)} />
        </Field>
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
      </div>
    </ModalShell>
  );
}
