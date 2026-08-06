// [B7 E3 2026-07-16] 주 엔티티 단건화(useScheduleSession(id) + DetailStates) — full-list find 제거(EP6/EP11)
// [TBO-20 20-3] 세션 상세 허브 — 한 세션의 ① 강사 출결 ② 학생 출결·피드백을 한 곳에서.
//  재사용(중복 제거): 출결=AttMarker(TBO-19)·피드백=SessionFeedbackForm(20-0). 자체 폼/버튼 없음.
//  단일 소스: 읽기=useScheduleSession(단건·enriched — courseName/instructorName 포함이라 코스·강사 클라 조인 불요)
//  ·useAttendance/useReports(권위 엔드포인트), 쓰기=useUpdateSchedule·useUpsertAttendance.
//  권한(20-1 정합): 강사 출결 CRUD=매니저만 / 학생 출결·피드백=매니저 or 담당 강사(본인 세션).
//  그 외 읽기 전용 — 강사의 타인 세션은 서버 403 → DetailStates 기본 문구.
"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import Link from "next/link";
import { Badge, ConfirmModal, DetailStates, EmptyState, Field, ModalShell, SectionCard, StatCard, type Tone } from "@/components/ui";
import { useRouter } from "next/navigation";
import {
  useScheduleSession, useStudents, useRooms,
  useAttendance, useInstructorAttendanceCommand, useUpdateSchedule, useRemoveSchedule, useUpsertAttendance,
  useScheduleResources, useUpdateInstructorAssignment,
} from "@/lib/queries";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { countsForPay } from "@/lib/domain/schedule";
import { payoutHours as hoursLabel } from "@/features/payouts/payout-shared"; // [감사 3] 시수 표기 단일화
import { AttMarker, INSTRUCTOR_ATT_OPTIONS, STUDENT_ATT_OPTIONS } from "@/features/attendance/AttMarker";
import { SessionFeedbackForm } from "@/features/reports/SessionFeedbackForm";
import type { AttendanceStatus, InstructorAttendanceStatus, SessionStatus } from "@/types";
import { shortDate } from "@/lib/format";
import { AccountingImpactModal } from "@/components/AccountingImpactModal";
import { InstructorAttendanceClearModal } from "@/features/attendance/InstructorAttendanceClearModal";
import { InstructorAttendanceCorrectionModal } from "@/features/attendance/InstructorAttendanceCorrectionModal";
import { editableSessionStatuses } from "@/lib/domain/lantiv";

// [TBO-34 C3] 상태 표기 = session-shared 단일 진실원(사본 제거)
import { SESSION_STATUS_LABEL as SESSION_STATUS_LABEL_ENTRIES, sessionStatusLabel as statusLabelOf, sessionStatusTone as statusToneOf } from "./session-shared";

export function ClassSessionDetailView({ sessionId }: { sessionId: number }) {
  const access = useAccountAccess();
  const admin = access.can("calendar.manage");
  const canManageAttendance = access.can("session-attendance.manage");
  const myId = access.instructorId;
  const sessionQuery = useScheduleSession(sessionId);
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAttendance();
  const router = useRouter();
  const attendanceCommand = useInstructorAttendanceCommand();
  const removeSchedule = useRemoveSchedule();
  const upsert = useUpsertAttendance();
  const [manageModal, setManageModal] = useState<'edit' | 'remove' | null>(null); // [TBO-58 P2]
  const [clearAttendanceOpen, setClearAttendanceOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // 세션 응답의 studentIds가 명시 코호트 우선 규칙을 이미 적용한 권위 집합이다.
  const loaded = sessionQuery.data;
  const roster = useMemo(
    () => {
      if (!loaded) return [];
      const ids = new Set(loaded.studentIds.map(Number));
      return students.filter((student) => ids.has(Number(student.id)));
    },
    [loaded, students],
  );

  const markInst = (st: InstructorAttendanceStatus) =>
    attendanceCommand.setAttendance(sessionId, st);
  const clearInst = () => setClearAttendanceOpen(true);
  const attOf = (stuId: number): AttendanceStatus | undefined => attendance.find((a) => a.sessionId === sessionId && a.studentId === stuId)?.status;
  const markStu = (stuId: number, st: AttendanceStatus) => upsert.mutate({ sessionId, studentId: stuId, status: st });

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <DetailStates query={sessionQuery} notFoundMessage="수업을 찾을 수 없습니다." backHref="/sessions">
        {(session) => {
          const ownSession = myId != null && session.instructorId === myId;
          const canFeedback = access.can("report.write") && (admin || ownSession); // [TBO-86I-2] capability ∧ 스코프
          const paid = countsForPay(session);
          return (
            <>
              <div>
                <Link href="/sessions" className="text-caption text-fg-muted hover:underline">← 수업 목록</Link>
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="text-title font-bold">{session.courseName || "수업"} · {shortDate(session.sessionDate)}</h1>
                  <Badge tone={statusToneOf(session.status) ?? "neutral"}>{statusLabelOf(session.status) ?? session.status}</Badge>
                </div>
                <p className="text-body text-fg-muted mt-0.5">
                  강사 {session.instructorName ?? "배정중"} · {session.startTime ?? "시간 미정"} · {session.durationMinutes}분 · {session.topic ?? "주제 미정"}
                </p>
              </div>

              {session.attendanceRequired && (
                <div role="alert" className="border border-attention bg-attention-subtle px-4 py-3 text-body">
                  <div className="font-semibold">이 수업의 출결 입력이 필요합니다.</div>
                  <div className="text-fg-muted mt-0.5">
                    {session.missingAttendance.instructor ? "강사 출결 미입력" : "강사 출결 입력 완료"}
                    {" · "}
                    학생 {session.missingAttendance.studentIds.length}명 미입력
                  </div>
                </div>
              )}

              {/* 세션 편집·삭제 — BE PATCH/DELETE와 회계 영향 ack 모달을 재사용. 매니저 이상만. */}
              {admin && (
                <div className="flex gap-2">
                  <button type="button" className="btn btn-sm" onClick={() => setManageModal('edit')}>수업 정보 수정</button>
                  <button type="button" className="btn btn-sm text-danger" onClick={() => setManageModal('remove')}>수업 삭제</button>
                </div>
              )}
              {admin && (
                <InstructorAssignmentPanel
                  sessionId={session.id}
                  currentInstructorId={session.instructorId}
                />
              )}
              {manageModal === 'edit' && <SessionEditModal session={session} onClose={() => setManageModal(null)} />}
              {manageModal === 'remove' && (
                <ConfirmModal
                  title="수업 삭제"
                  message={`${shortDate(session.sessionDate)} ${session.courseName || '수업'} 회차를 삭제할까요? 출결·보고서도 함께 삭제됩니다.`}
                  confirmLabel="삭제"
                  danger
                  onClose={() => setManageModal(null)}
                  onConfirm={() => removeSchedule.mutate({ id: session.id }, { onSuccess: () => router.push('/sessions') })}
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="학생" value={`${roster.length}명`} />
                <StatCard label="회차 상태" value={statusLabelOf(session.status) ?? session.status} />
                <StatCard label="강사 출결" value={session.instructorAttendance ? (INSTRUCTOR_ATT_OPTIONS.find((o) => o.value === session.instructorAttendance)?.label ?? "—") : "미표시"} />
                <StatCard label="시수 인정" value={paid ? hoursLabel(session.durationMinutes) : "제외"} tone={paid ? "accent" : undefined} />
              </div>

              {/* 강사 출결은 session-attendance.manage 전용 command와 AttMarker를 재사용한다. */}
              <SectionCard title="강사 출결">
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  {session.instructorId == null ? (
                    <span className="text-body text-attention">담당 강사를 배정한 뒤 출결을 입력할 수 있습니다.</span>
                  ) : (
                    <AttMarker value={session.instructorAttendance} options={INSTRUCTOR_ATT_OPTIONS} canEdit={canManageAttendance} pending={attendanceCommand.isPending} onMark={markInst} onClear={canManageAttendance ? clearInst : undefined} />
                  )}
                  <span className="text-caption text-fg-subtle">
                    {paid ? "시수 인정(진행·결석 아님)" : `시수 제외${session.instructorAttendance === "absent" ? "(결석)" : session.status === "makeup" ? "(보강)" : session.status !== "held" ? `(${statusLabelOf(session.status) ?? session.status})` : ""}`}
                  </span>
                  {session.instructorId != null && !canManageAttendance && (
                    <div className="ml-auto inline-flex items-center gap-2">
                      <span className="text-caption text-fg-subtle">열람 전용</span>
                      {ownSession && access.can('instructor.self') && (
                        <button type="button" className="btn btn-sm" onClick={() => setCorrectionOpen(true)}>
                          정정 요청
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ② 학생 출결 · 피드백 — AttMarker + SessionFeedbackForm 재사용 */}
              <SectionCard title={`학생 출결 · 피드백 (${roster.length}명)`}>
                {session.instructorId == null ? (
                  <EmptyState message="담당 강사를 배정한 뒤 출결과 리포트를 작성할 수 있습니다." />
                ) : !roster.length ? (
                  <EmptyState message="수강생이 없습니다." />
                ) : (
                  <div className="divide-y border-line-muted">
                    {roster.map((student) => {
                      const open = expanded.has(student.id);
                      return (
                        <Fragment key={student.id}>
                          <div className="p-4 flex items-center gap-3 flex-wrap">
                            <div className="min-w-[120px]">
                              <span className="font-medium">{student.name}</span>
                              {student.englishName && <span className="text-caption text-fg-subtle ml-2">{student.englishName}</span>}
                            </div>
                            <AttMarker value={attOf(student.id)} options={STUDENT_ATT_OPTIONS} canEdit={canManageAttendance} pending={upsert.isPending} onMark={(st) => markStu(student.id, st)} />
                            <button type="button" className="btn btn-sm ml-auto" onClick={() => toggle(student.id)}>
                              {open ? "피드백 접기 ▴" : "피드백 작성 ▾"}
                            </button>
                          </div>
                          {open && (
                            <div className="bg-canvas-subtle">
                              <SessionFeedbackForm session={session} student={student} canEdit={canFeedback} />
                            </div>
                          )}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
                <p className="text-caption text-fg-subtle mt-2 px-1">출결·피드백은 출석부·보고서와 같은 데이터(단일 소스) — 여기서의 수정이 즉시 반영됩니다.</p>
              </SectionCard>
            </>
          );
        }}
      </DetailStates>
      <InstructorAttendanceClearModal sessionId={clearAttendanceOpen ? sessionId : null}
        onClose={() => setClearAttendanceOpen(false)}
        onSubmit={(id, reason) => { setClearAttendanceOpen(false); attendanceCommand.clearAttendance(id, reason); }} />
      {correctionOpen && loaded && (
        <InstructorAttendanceCorrectionModal
          session={loaded}
          onClose={() => setCorrectionOpen(false)}
        />
      )}
      <AccountingImpactModal prompt={attendanceCommand.accountingPrompt} onClose={attendanceCommand.dismissAccountingPrompt} onConfirm={attendanceCommand.confirmAccountingImpact} />
      <AccountingImpactModal
        prompt={removeSchedule.accountingPrompt}
        onClose={removeSchedule.dismissAccountingPrompt}
        onConfirm={() => removeSchedule.confirmAccountingImpact({ onSuccess: () => router.push('/sessions') })}
      />
    </div>
  );
}

function InstructorAssignmentPanel({ sessionId, currentInstructorId }: {
  sessionId: number;
  currentInstructorId: number | null;
}) {
  const { data: resources } = useScheduleResources();
  const updateAssignment = useUpdateInstructorAssignment();
  const [selection, setSelection] = useState(currentInstructorId == null ? 'unassigned' : String(currentInstructorId));
  const [reason, setReason] = useState('');
  const [setCourseDefault, setSetCourseDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    setSelection(currentInstructorId == null ? 'unassigned' : String(currentInstructorId));
  }, [currentInstructorId]);
  const targetInstructorId = selection === 'unassigned' ? null : Number(selection);
  const changed = targetInstructorId !== currentInstructorId;
  const valid = changed && reason.trim().length >= 5 && Number.isFinite(targetInstructorId ?? 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || updateAssignment.isPending) return;
    setError(null);
    setSuccess('');
    updateAssignment.mutate({
      id: sessionId,
      body: {
        instructorId: targetInstructorId,
        expectedInstructorId: currentInstructorId,
        reason: reason.trim(),
        setCourseDefault: targetInstructorId == null ? false : setCourseDefault,
      },
    }, {
      onSuccess: (result) => {
        setReason('');
        setSuccess(result.row.instructorId == null ? '담당자를 배정중으로 변경했습니다.' : `${result.row.instructorName ?? '강사'} 배정을 저장했습니다.`);
      },
      onError: (caught) => setError(apiErrorMessage(caught, '담당 강사를 변경하지 못했습니다.')),
    });
  };

  return (
    <SectionCard title="담당 강사 배정">
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="담당 강사">
          <select className="input" value={selection} onChange={(event) => { setSelection(event.target.value); setSuccess(''); }}>
            <option value="unassigned">배정중</option>
            {(resources?.instructors ?? []).map((instructor) => (
              <option key={instructor.id} value={instructor.id}>{instructor.name}</option>
            ))}
          </select>
        </Field>
        <Field label="변경 사유 *">
          <input className="input" minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 담당 가능 강사 확정" />
        </Field>
        {targetInstructorId != null && (
          <label className="sm:col-span-2 flex items-center gap-2 text-body">
            <input type="checkbox" checked={setCourseDefault} onChange={(event) => setSetCourseDefault(event.target.checked)} />
            이 과목의 기본 담당 강사도 함께 변경
          </label>
        )}
        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3">
          {error && <span className="text-caption text-danger mr-auto" role="alert">{error}</span>}
          {success && <span className="text-caption text-success mr-auto" role="status">{success}</span>}
          <button type="submit" className="btn btn-primary" disabled={!valid || updateAssignment.isPending}>
            {updateAssignment.isPending ? '저장 중...' : '담당 강사 저장'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

// [TBO-58 P2] 수업 정보 수정 모달 — 시간·강의실·상태·주제(요구 명시 필드). useUpdateSchedule 재사용이라
//  회계 영향 ack(409→모달)·캐시 무효화가 캘린더 편집과 동일하게 적용된다.
function SessionEditModal({ session, onClose }: {
  session: { id: number; sessionDate: string; startTime?: string | null; durationMinutes: number; roomId?: number | null; status: string; topic?: string | null };
  onClose: () => void;
}) {
  const updateSchedule = useUpdateSchedule();
  const { data: rooms = [] } = useRooms();
  const [sessionDate, setSessionDate] = useState(session.sessionDate);
  const [startTime, setStartTime] = useState(session.startTime ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(session.durationMinutes));
  const [roomId, setRoomId] = useState(session.roomId != null ? String(session.roomId) : '');
  const [status, setStatus] = useState(session.status);
  const [topic, setTopic] = useState(session.topic ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const minutes = Number(durationMinutes);
    if (!sessionDate) return setError('날짜를 입력해 주세요.');
    if (!Number.isInteger(minutes) || minutes <= 0) return setError('수업 시간을 분 단위로 입력해 주세요.');
    updateSchedule.mutate({
      id: session.id,
      body: {
        sessionDate,
        startTime: startTime || undefined,
        durationMinutes: minutes,
        ...(roomId ? { roomId: Number(roomId) } : {}),
        status: status as never,
        topic: topic.trim() || undefined,
      },
    }, {
      onSuccess: onClose,
      onError: (caught) => {
        // 회계 영향 ack(409 ACCOUNTING_IMPACT_ACK_REQUIRED)는 useUpdateSchedule 래퍼가 code 기반으로
        //  가로채 모달을 띄우므로 여기 도달하지 않는다(감사 5-A: 메시지 includes 분기는 죽은 코드라 제거).
        setError(apiErrorMessage(caught, '수정하지 못했습니다(충돌·검증을 확인하세요).')); // [75A] SSOT 파싱 수렴
      },
    });
  };

  return (
    <ModalShell title="수업 정보 수정" onClose={onClose}>
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="날짜 *"><input type="date" className="input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} /></Field>
        <Field label="시작 시각"><input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
        <Field label="수업 시간(분) *"><input type="number" min={10} step={10} className="input" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} /></Field>
        <Field label="강의실">
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">미지정</option>
            {rooms.map((room) => (<option key={room.id} value={room.id}>{room.name}</option>))}
          </select>
        </Field>
        <Field label="상태">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {editableSessionStatuses(session.status as SessionStatus).map((value) => (
              <option key={value} value={value} disabled={value === 'held'}>
                {SESSION_STATUS_LABEL_ENTRIES[value]}{value === 'held' ? ' (출결로 자동 전이)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="주제"><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="수업 주제" /></Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-1">
          {error && <p className="text-body text-danger mr-auto" role="alert">{error}</p>}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn-primary" disabled={updateSchedule.isPending}>
            {updateSchedule.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
      <AccountingImpactModal prompt={updateSchedule.accountingPrompt} onClose={updateSchedule.dismissAccountingPrompt} onConfirm={updateSchedule.confirmAccountingImpact} />
    </ModalShell>
  );
}
