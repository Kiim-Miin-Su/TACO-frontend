"use client";
// [TBO-87] 직원(매니저 이상) 근태 탭 — 강사 출석과 탭 자체를 분리(대표 지시).
//  대상 = 활성 manager/admin/super_admin(겸직 매니저 포함 — 겸직자는 강사 탭에도 수업·근태가 보인다).
//  저장 원부는 staff_attendance_records 그대로(TBO-81 — 분리 저장·목록 합성 규약), 이 탭은 근태만 본다.
import { useMemo, useState } from "react";
import type { StaffAttendanceRecord, StaffAttendanceStatus } from "@kms545487/contracts";
import { DateRangeControl } from "@/components/DateRangeControl";
import { ReasonModal } from "@/components/ReasonModal";
import { Badge, EmptyState, LoadingState, SectionCard, StatCard, TableWrap } from "@/components/ui";
import { MultiPick } from "@/features/calendar/CalendarFilterControls";
import { apiErrorMessage } from "@/lib/api-error";
import { STAFF_ATTENDANCE_LABEL, staffAttendanceStatusTone } from "@/lib/domain/staff-attendance";
import { currentMonthKst, monthRangeKst, todayKst } from "@/lib/format";
import { useRemoveStaffAttendance, useStaffAttendance, useUsers } from "@/lib/queries";
import { StaffAttendanceRecordModal } from "./StaffAttendanceRecordModal";
import { useAccountAccess } from "@/lib/useAccountAccess";

const STAFF_ROLES_KO: Record<string, string> = { manager: "매니저", admin: "관리자", super_admin: "대표" };
const kstTime = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }) : "";

export function StaffDayAttendanceView() {
  const access = useAccountAccess();
  const canManage = access.can("attendance.manage"); // 근무·휴가 변경 = 대표 전용(86D 분리 규약)
  const [range, setRange] = useState(monthRangeKst(currentMonthKst()));
  const [pickedStaff, setPickedStaff] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"" | StaffAttendanceStatus>("");
  const [editRecord, setEditRecord] = useState<StaffAttendanceRecord | "new" | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StaffAttendanceRecord | null>(null);
  const [error, setError] = useState("");
  const remove = useRemoveStaffAttendance();

  const { data: users = [] } = useUsers();
  // 직원 탭 모집단 = 활성 매니저 이상(겸직 매니저 포함). 순수 강사는 강사 탭 소관.
  const staff = useMemo(
    () => users
      .filter((user) => user.status === "active" && (user.role === "manager" || user.role === "admin" || user.role === "super_admin"))
      .map((user) => ({ id: Number(user.id), name: user.name, role: user.role })),
    [users],
  );
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const staffIds = useMemo(() => new Set(staff.map((member) => member.id)), [staff]);

  const records = useStaffAttendance({ from: range.from, to: range.to });
  const rows = useMemo(
    () => (records.data ?? [])
      .filter((row) => staffIds.has(Number(row.staffId)))
      .filter((row) => !pickedStaff.size || pickedStaff.has(Number(row.staffId)))
      .filter((row) => !statusFilter || row.status === statusFilter)
      .sort((a, b) => b.workDate.localeCompare(a.workDate) || Number(a.staffId) - Number(b.staffId)),
    [records.data, staffIds, pickedStaff, statusFilter],
  );
  const leaveCount = rows.filter((row) => row.status.endsWith("_leave")).length;

  return (
    <SectionCard
      title="직원 근태 목록"
      action={canManage
        ? <button type="button" className="btn btn-sm btn-primary" disabled={!staff.length} onClick={() => { setError(""); setEditRecord("new"); }}>근무·휴가 추가</button>
        : undefined}
    >
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <DateRangeControl value={range} onChange={setRange} />
        <MultiPick
          dim="instructor"
          options={staff}
          picked={pickedStaff}
          onToggle={(id) => setPickedStaff((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onClear={() => setPickedStaff(new Set())}
        />
        <select aria-label="상태 필터" className="input h-7 w-32 text-caption" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | StaffAttendanceStatus)}>
          <option value="">상태 전체</option>
          {Object.entries(STAFF_ATTENDANCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="조회 직원" value={`${pickedStaff.size || staff.length}명`} />
        <StatCard label="근태 기록" value={`${rows.length}건`} />
        <StatCard label="휴가·병가" value={`${leaveCount}건`} />
        <StatCard label="기간" value={`${range.from.slice(5)}~${range.to.slice(5)}`} />
      </div>

      {error && <p className="text-caption text-danger mb-2" role="alert">{error}</p>}
      {records.isPending ? (
        <LoadingState message="직원 근태를 불러오는 중..." />
      ) : !rows.length ? (
        <EmptyState message="조건에 맞는 근태 기록이 없습니다. 근무·휴가 추가로 기록을 시작하세요." />
      ) : (
        <TableWrap>
          <table className="table text-body">
            <thead>
              <tr><th>날짜</th><th>직원</th><th>역할</th><th>상태</th><th>시간</th><th>메모</th>{canManage && <th aria-label="관리" />}</tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const member = staffById.get(Number(row.staffId));
                return (
                  <tr key={row.id}>
                    <td className="mono">{row.workDate}</td>
                    <td>{member?.name ?? `직원 ${row.staffId}`}</td>
                    <td className="text-caption text-fg-muted">{STAFF_ROLES_KO[member?.role ?? ""] ?? member?.role ?? ""}</td>
                    <td><Badge tone={staffAttendanceStatusTone(row.status)}>{STAFF_ATTENDANCE_LABEL[row.status]}</Badge></td>
                    <td className="mono text-caption">{row.checkInAt ? `${kstTime(row.checkInAt)}~${kstTime(row.checkOutAt)}` : "—"}</td>
                    <td className="text-caption text-fg-muted max-w-[200px] truncate" title={row.memo ?? ""}>{row.memo ?? ""}</td>
                    {canManage && (
                      <td className="text-right whitespace-nowrap">
                        <button type="button" className="btn btn-sm" onClick={() => { setError(""); setEditRecord(row); }}>수정</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="text-caption text-fg-subtle mt-2">
        직원 근태는 수업 시수·정산과 별개 원부입니다. 겸직 매니저의 수업 출결·시수는 강사 탭에서 확인하세요.
      </p>

      {canManage && editRecord && (
        <StaffAttendanceRecordModal
          staffOptions={staff}
          staffFieldLabel="직원"
          record={editRecord === "new" ? undefined : editRecord}
          defaultDate={todayKst()}
          onClose={() => setEditRecord(null)}
          onSaved={() => setEditRecord(null)}
          onDelete={(record) => { setEditRecord(null); setDeleteRecord(record); }}
        />
      )}
      {deleteRecord && (
        <ReasonModal
          mode="input"
          title={`근태 기록 삭제 — ${deleteRecord.workDate} · ${staffById.get(Number(deleteRecord.staffId))?.name ?? deleteRecord.staffId}`}
          placeholder="삭제 사유를 입력하세요(감사 이력에 남습니다)"
          submitLabel="삭제"
          onClose={() => setDeleteRecord(null)}
          onSubmit={async (reason) => {
            try {
              await remove.mutateAsync({ id: deleteRecord.id, reason });
              setDeleteRecord(null);
            } catch (cause) {
              setError(apiErrorMessage(cause, "근태 기록을 삭제하지 못했습니다."));
              setDeleteRecord(null);
            }
          }}
        />
      )}
    </SectionCard>
  );
}
