"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InstructorAttendanceLedgerEntry, StaffAttendanceRecord } from "@kms545487/contracts";
import { DateRangeControl } from "@/components/DateRangeControl";
import { ReasonModal } from "@/components/ReasonModal";
import { Badge, ClickableTableRow, EmptyState, LoadingState, SectionCard, StatCard, TableWrap } from "@/components/ui";
import { MultiPick } from "@/features/calendar/CalendarFilterBar";
import { apiErrorMessage } from "@/lib/api-error";
import {
  filterLedgerByInstructors,
  groupAttendanceLedger,
  LESSON_ATTENDANCE_LABEL,
  STAFF_ATTENDANCE_LABEL,
  type AttendanceLedgerGroupMode,
} from "@/lib/domain/staff-attendance";
import { currentMonthKst, monthRangeKst, todayKst } from "@/lib/format";
import { internalRoute } from "@/lib/navigation-security";
import { useInstructorAttendanceLedger, useRemoveStaffAttendance, useScheduleResources, useStaffAttendance } from "@/lib/queries";
import { isInstructorScheduleResource } from "@/lib/domain/schedule-resources";
import { StaffAttendanceRecordModal } from "./StaffAttendanceRecordModal";
import { useAccountAccess } from "@/lib/useAccountAccess";

const statusLabel = (entry: InstructorAttendanceLedgerEntry): string => entry.source === "staff_day"
  ? STAFF_ATTENDANCE_LABEL[entry.status as keyof typeof STAFF_ATTENDANCE_LABEL]
  : LESSON_ATTENDANCE_LABEL[entry.status as keyof typeof LESSON_ATTENDANCE_LABEL];

const statusTone = (status: string): "success" | "attention" | "danger" | "neutral" =>
  status === "present" || status === "remote_work" ? "success"
    : status === "late" || status === "paid_leave" || status === "sick_leave" ? "attention"
      : status === "absent" || status === "unpaid_leave" ? "danger"
        : "neutral";

export function StaffAttendanceLedgerView() {
  const canManageAttendance = useAccountAccess().can("attendance.manage");
  const initialRange = monthRangeKst(currentMonthKst());
  const [range, setRange] = useState(initialRange);
  const [q, setQ] = useState("");
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [groupMode, setGroupMode] = useState<AttendanceLedgerGroupMode>("date");
  const [pickedInstructors, setPickedInstructors] = useState<Set<number>>(new Set());
  const [editRecord, setEditRecord] = useState<StaffAttendanceRecord | "new" | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StaffAttendanceRecord | null>(null);
  const [error, setError] = useState("");
  const remove = useRemoveStaffAttendance();
  const { data: resources } = useScheduleResources();
  const query = useMemo(() => ({ from: range.from, to: range.to, q: q.trim() || undefined, subjectId }), [range, q, subjectId]);
  const ledger = useInstructorAttendanceLedger(query);
  const staffRecords = useStaffAttendance({ from: range.from, to: range.to });
  const instructors = useMemo(() => (resources?.instructors ?? [])
    .filter(isInstructorScheduleResource)
    .map((row) => ({ id: Number(row.id), name: row.name, color: row.color, sub: row.sub })), [resources]);
  const subjectOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const course of resources?.courses ?? []) if (course.subjectId != null && course.subjectName) map.set(Number(course.subjectId), course.subjectName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
  }, [resources]);
  const entries = useMemo(() => filterLedgerByInstructors(ledger.data?.entries ?? [], pickedInstructors), [ledger.data, pickedInstructors]);
  const groups = useMemo(() => groupAttendanceLedger(entries, groupMode), [entries, groupMode]);
  const lessonEntries = entries.filter((entry) => entry.source === "class_session");
  const staffEntries = entries.filter((entry) => entry.source === "staff_day");
  const teachingMinutes = lessonEntries.reduce((total, entry) => total + entry.teachingMinutes, 0);
  const leaveCount = staffEntries.filter((entry) => ["paid_leave", "unpaid_leave", "sick_leave"].includes(entry.status)).length;

  const openStaffRecord = (entry: InstructorAttendanceLedgerEntry) => {
    if (!canManageAttendance || entry.source !== "staff_day") return;
    const canonical = staffRecords.data?.find((candidate) => Number(candidate.id) === Number(entry.recordId));
    setEditRecord(canonical ?? {
      id: entry.recordId,
      staffId: entry.instructorId,
      workDate: entry.date,
      status: entry.status as StaffAttendanceRecord["status"],
      checkInAt: entry.startTime ? new Date(`${entry.date}T${entry.startTime}:00+09:00`).toISOString() : null,
      checkOutAt: entry.endTime ? new Date(`${entry.date}T${entry.endTime}:00+09:00`).toISOString() : null,
      memo: entry.memo,
      createdBy: 0,
      updatedBy: 0,
      createdAt: "",
      updatedAt: "",
    });
  };

  const requestDelete = async (reason: string) => {
    if (!deleteRecord) return;
    setError("");
    try {
      await remove.mutateAsync({ id: deleteRecord.id, reason });
      setDeleteRecord(null);
    } catch (caught) {
      setError(apiErrorMessage(caught, "근무·휴가 기록을 삭제하지 못했습니다."));
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="강사 출결 목록"
        action={(
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <div className="flex rounded-md overflow-hidden border">
              <button type="button" className={`btn btn-sm rounded-none border-0 ${groupMode === "date" ? "badge-accent" : ""}`} onClick={() => setGroupMode("date")}>날짜순</button>
              <button type="button" className={`btn btn-sm rounded-none border-0 ${groupMode === "instructor" ? "badge-accent" : ""}`} onClick={() => setGroupMode("instructor")}>이름순</button>
            </div>
            {canManageAttendance && (
              <button type="button" className="btn btn-sm btn-primary" disabled={!instructors.length} onClick={() => setEditRecord("new")}>근무·휴가 추가</button>
            )}
          </div>
        )}
      >
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <DateRangeControl value={range} onChange={setRange} />
          <MultiPick
            dim="instructor"
            options={instructors}
            picked={pickedInstructors}
            onToggle={(id) => setPickedInstructors((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onClear={() => setPickedInstructors(new Set())}
          />
          <select aria-label="과목 검색" className="input h-7 w-32 text-caption" value={subjectId ?? ""} onChange={(event) => setSubjectId(event.target.value ? Number(event.target.value) : undefined)}>
            <option value="">과목 전체</option>
            {subjectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <input aria-label="강사 또는 과목 검색" className="input h-7 w-52 max-w-full" value={q} onChange={(event) => setQ(event.target.value)} placeholder="강사·과목 검색" />
          <Link href={pickedInstructors.size ? internalRoute.calendarCompare([...pickedInstructors], range) : "/calendar"} className="btn btn-sm" aria-disabled={!pickedInstructors.size} onClick={(event) => { if (!pickedInstructors.size) event.preventDefault(); }}>
            시간표 비교
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="조회 강사" value={`${new Set(entries.map((entry) => entry.instructorId)).size}명`} />
          <StatCard label="수업 출결" value={`${lessonEntries.length}건`} sub={`인정 ${Math.round((teachingMinutes / 60) * 10) / 10}h`} tone="accent" />
          <StatCard label="근무 기록" value={`${staffEntries.length}건`} tone="success" />
          <StatCard label="휴가·병가" value={`${leaveCount}건`} tone="attention" />
        </div>
        {error && <p role="alert" className="text-caption text-danger mb-2">{error}</p>}
        {ledger.isPending ? <LoadingState /> : ledger.isError ? (
          <EmptyState message={apiErrorMessage(ledger.error, "출결 목록을 불러오지 못했습니다.")} />
        ) : !entries.length ? <EmptyState message="선택한 기간과 검색 조건의 출결 기록이 없습니다." /> : (
          <TableWrap>
            <table className="table text-body">
              <thead>
                <tr>
                  <th className="min-w-[104px]">날짜</th>
                  <th className="min-w-[100px]">강사</th>
                  <th className="min-w-[112px]">구분</th>
                  <th>과목·코스</th>
                  <th className="min-w-[82px]">시간</th>
                  <th className="min-w-[76px]">상태</th>
                  <th className="text-right min-w-[72px]">인정 시수</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((group) => [
                  <tr key={`group:${group.key}`} className="bg-canvas-subtle"><th colSpan={7} className="text-left">{group.label} · {group.entries.length}건</th></tr>,
                  ...group.entries.map((entry) => {
                    const cells = (
                      <>
                        <td className="mono">{entry.date}</td>
                        <td className="font-medium">{entry.instructorName}</td>
                        <td>{entry.source === "class_session" ? "수업 출결" : "근무·휴가"}</td>
                        <td>{entry.subjectName ?? "—"}{entry.courseName ? <span className="text-fg-muted"> · {entry.courseName}</span> : null}</td>
                        <td className="mono text-fg-muted">{entry.startTime ?? "—"}{entry.endTime ? `~${entry.endTime}` : ""}</td>
                        <td><Badge tone={statusTone(entry.status)}>{statusLabel(entry)}</Badge></td>
                        <td className="text-right mono">{entry.teachingMinutes ? `${Math.round((entry.teachingMinutes / 60) * 10) / 10}h` : "—"}</td>
                      </>
                    );
                    return entry.source === "class_session" ? (
                      <ClickableTableRow key={entry.key} href={internalRoute.attendanceInstructor(entry.instructorId)} label={`${entry.instructorName} 출결 상세`}>{cells}</ClickableTableRow>
                    ) : canManageAttendance ? (
                      <ClickableTableRow key={entry.key} onActivate={() => openStaffRecord(entry)} label={`${entry.instructorName} ${entry.date} 근무 기록 수정`}>{cells}</ClickableTableRow>
                    ) : (
                      <tr key={entry.key}>{cells}</tr>
                    );
                  }),
                ])}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="text-caption text-fg-subtle mt-2">수업 인정 시수와 직원 근태 횟수는 원부가 다릅니다. 근무·휴가 기록은 급여 정책 확정 전 수업 정산액을 변경하지 않습니다.</p>
      </SectionCard>

      {canManageAttendance && editRecord && (
        <StaffAttendanceRecordModal
          instructors={instructors}
          record={editRecord === "new" ? undefined : editRecord}
          defaultDate={todayKst()}
          onClose={() => setEditRecord(null)}
          onSaved={() => setEditRecord(null)}
          onDelete={(record) => { setEditRecord(null); setDeleteRecord(record); }}
        />
      )}
      {canManageAttendance && deleteRecord && (
        <ReasonModal mode="input" title="근무·휴가 기록 삭제" submitLabel="삭제" placeholder="삭제 사유를 입력하세요" onClose={() => setDeleteRecord(null)} onSubmit={requestDelete} />
      )}
    </div>
  );
}
