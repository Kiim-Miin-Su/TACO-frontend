// [B7 E3 2026-07-16] 주 엔티티 단건화(useScheduleSession(id) + DetailStates) — full-list find 제거(EP6/EP11)
// [TBO-20 20-3] 세션 상세 허브 — 한 세션의 ① 강사 출결 ② 학생 출결·피드백을 한 곳에서.
//  재사용(중복 제거): 출결=AttMarker(TBO-19)·피드백=SessionFeedbackForm(20-0). 자체 폼/버튼 없음.
//  단일 소스: 읽기=useScheduleSession(단건·enriched — courseName/instructorName 포함이라 코스·강사 클라 조인 불요)
//  ·useAttendance/useReports(권위 엔드포인트), 쓰기=useUpdateSchedule·useUpsertAttendance.
//  권한(20-1 정합): 강사 출결 CRUD=매니저만 / 학생 출결·피드백=매니저 or 담당 강사(본인 세션).
//  그 외 읽기 전용 — 강사의 타인 세션은 서버 403 → DetailStates 기본 문구.
"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, DetailStates, EmptyState, SectionCard, StatCard, type Tone } from "@/components/ui";
import {
  useScheduleSession, useEnrollments, useStudents,
  useAttendance, useUpdateSchedule, useUpsertAttendance, useMarkMyInstructorAttendance,
} from "@/lib/queries";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { countsForPay } from "@/lib/domain/schedule";
import { AttMarker, INSTRUCTOR_ATT_OPTIONS, STUDENT_ATT_OPTIONS } from "@/features/attendance/AttMarker";
import { SessionFeedbackForm } from "@/features/reports/SessionFeedbackForm";
import type { AttendanceStatus, InstructorAttendanceStatus } from "@/types";
import { shortDate } from "@/lib/format";
import { AccountingImpactModal } from "@/components/AccountingImpactModal";

// [TBO-34 C3] 상태 표기 = session-shared 단일 진실원(사본 제거)
import { sessionStatusLabel as statusLabelOf, sessionStatusTone as statusToneOf } from "./session-shared";

export function ClassSessionDetailView({ sessionId }: { sessionId: number }) {
  const access = useAccountAccess();
  const admin = access.can("calendar.manage");
  const myId = access.instructorId;
  const sessionQuery = useScheduleSession(sessionId);
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAttendance();
  const updateSchedule = useUpdateSchedule();
  const markMine = useMarkMyInstructorAttendance(); // [TBO-62 ④] 강사 본인 최초 체크 전용
  const upsert = useUpsertAttendance();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // 이 수업(코스)의 수강생 = enrollments courseId 일치(활성 수강 — 배지·보고서와 동일 모집단).
  //  로드 전엔 빈 배열 — 렌더는 DetailStates가 skeleton으로 대체하므로 표시 영향 없음.
  const loaded = sessionQuery.data;
  const roster = useMemo(
    () => (loaded ? enrollments.filter((e) => e.courseId === loaded.courseId).map((e) => students.find((s) => s.id === e.studentId)).filter((s): s is NonNullable<typeof s> => Boolean(s)) : []),
    [loaded, enrollments, students],
  );

  // [TBO-62 ④ 2026-07-24] 강사 본인 출결 = 최초 1회 체크 가능(대표 지시), 수정·초기화는 매니저 이상.
  const ownUnmarked = (s0?: { instructorId: number; instructorAttendance?: string | null }) =>
    !!s0 && myId != null && s0.instructorId === myId && s0.instructorAttendance == null;
  const markInst = (st: InstructorAttendanceStatus) =>
    admin
      ? updateSchedule.mutate({ id: sessionId, body: { instructorAttendance: st } })
      : markMine.mutate({ id: sessionId, status: st });
  const clearInst = () => updateSchedule.mutate({ id: sessionId, body: { clearInstructorAttendance: true } });
  const attOf = (stuId: number): AttendanceStatus | undefined => attendance.find((a) => a.sessionId === sessionId && a.studentId === stuId)?.status;
  const markStu = (stuId: number, st: AttendanceStatus) => upsert.mutate({ sessionId, studentId: stuId, status: st });

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <DetailStates query={sessionQuery} notFoundMessage="수업을 찾을 수 없습니다." backHref="/sessions">
        {(session) => {
          const ownSession = myId != null && session.instructorId === myId;
          const canStudent = admin || ownSession; // 학생 출결·피드백 = 매니저 or 담당 강사
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
                  강사 {session.instructorName || "—"} · {session.startTime ?? "시간 미정"} · {session.durationMinutes}분 · {session.topic ?? "주제 미정"}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="학생" value={`${roster.length}명`} />
                <StatCard label="회차 상태" value={statusLabelOf(session.status) ?? session.status} />
                <StatCard label="강사 출결" value={session.instructorAttendance ? (INSTRUCTOR_ATT_OPTIONS.find((o) => o.value === session.instructorAttendance)?.label ?? "—") : "미표시"} />
                <StatCard label="시수 인정" value={paid ? `${Math.round((session.durationMinutes / 60) * 100) / 100}h` : "제외"} tone={paid ? "accent" : undefined} />
              </div>

              {/* ① 강사 출결 — 매니저 CRUD + 강사 본인 최초 1회 체크(TBO-62 ④) — AttMarker 재사용 */}
              <SectionCard title="강사 출결">
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <AttMarker value={session.instructorAttendance} options={INSTRUCTOR_ATT_OPTIONS} canEdit={admin || ownUnmarked(session)} pending={updateSchedule.isPending || markMine.isPending} onMark={markInst} onClear={admin ? clearInst : undefined} />
                  <span className="text-caption text-fg-subtle">
                    {paid ? "시수 인정(진행·결석 아님)" : `시수 제외${session.instructorAttendance === "absent" ? "(결석)" : session.status === "makeup" ? "(보강)" : session.status !== "held" ? `(${statusLabelOf(session.status) ?? session.status})` : ""}`}
                  </span>
                  {!admin && (
                    <span className="text-caption text-fg-subtle ml-auto">
                      {ownUnmarked(session) ? "본인 수업 — 최초 1회 체크 가능 (수정은 매니저)" : "열람 전용 (수정은 매니저)"}
                    </span>
                  )}
                </div>
              </SectionCard>

              {/* ② 학생 출결 · 피드백 — AttMarker + SessionFeedbackForm 재사용 */}
              <SectionCard title={`학생 출결 · 피드백 (${roster.length}명)`}>
                {!roster.length ? (
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
                            <AttMarker value={attOf(student.id)} options={STUDENT_ATT_OPTIONS} canEdit={canStudent} pending={upsert.isPending} onMark={(st) => markStu(student.id, st)} />
                            <button type="button" className="btn btn-sm ml-auto" onClick={() => toggle(student.id)}>
                              {open ? "피드백 접기 ▴" : "피드백 작성 ▾"}
                            </button>
                          </div>
                          {open && (
                            <div className="bg-canvas-subtle">
                              <SessionFeedbackForm session={session} student={student} canEdit={canStudent} />
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
      <AccountingImpactModal prompt={updateSchedule.accountingPrompt} onClose={updateSchedule.dismissAccountingPrompt} onConfirm={updateSchedule.confirmAccountingImpact} />
    </div>
  );
}
