// [TBO-20 20-3] 세션 상세 허브 — 한 세션의 ① 강사 출결 ② 학생 출결·피드백을 한 곳에서.
//  재사용(중복 제거): 출결=AttMarker(TBO-19)·피드백=SessionFeedbackForm(20-0). 자체 폼/버튼 없음.
//  단일 소스: 읽기=useSchedule/useAttendance/useReports(권위 엔드포인트), 쓰기=useUpdateSchedule·useUpsertAttendance.
//  권한(20-1 정합): 강사 출결 CRUD=매니저만 / 학생 출결·피드백=매니저 or 담당 강사(본인 세션). 그 외 읽기 전용.
"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, SectionCard, StatCard, type Tone } from "@/components/ui";
import {
  useSchedule, useCourses, useInstructors, useEnrollments, useStudents,
  useAttendance, useUpdateSchedule, useUpsertAttendance,
} from "@/lib/queries";
import { useTacoStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { myInstructorId } from "@/lib/auth";
import { countsForPay } from "@/lib/domain/schedule";
import { AttMarker, INSTRUCTOR_ATT_OPTIONS, STUDENT_ATT_OPTIONS } from "@/features/attendance/AttMarker";
import { SessionFeedbackForm } from "@/features/reports/SessionFeedbackForm";
import type { AttendanceStatus, InstructorAttendanceStatus } from "@/types";
import { shortDate } from "@/lib/format";

const statusTone: Record<string, Tone> = { held: "success", scheduled: "accent", canceled: "danger", no_show: "danger", makeup: "attention" };
const statusLabel: Record<string, string> = { held: "진행완료", scheduled: "예정", canceled: "취소", no_show: "노쇼", makeup: "보강" };

export function ClassSessionDetailView({ sessionId }: { sessionId: number }) {
  const role = useTacoStore((s) => s.currentRole);
  const admin = isAdmin(role);
  const myId = myInstructorId();
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAttendance();
  const updateSchedule = useUpdateSchedule();
  const upsert = useUpsertAttendance();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const session = classSessions.find((s) => s.id === sessionId);

  // 이 수업(코스)의 수강생 = enrollments courseId 일치(활성 수강 — 배지·보고서와 동일 모집단).
  const roster = useMemo(
    () => (session ? enrollments.filter((e) => e.courseId === session.courseId).map((e) => students.find((s) => s.id === e.studentId)).filter((s): s is NonNullable<typeof s> => Boolean(s)) : []),
    [session, enrollments, students],
  );

  if (!session) {
    return <div className="p-6 text-fg-muted">수업을 찾을 수 없습니다. (id: {sessionId})</div>;
  }

  const course = courses.find((c) => c.id === session.courseId);
  const instructor = instructors.find((i) => i.id === session.instructorId);
  const ownSession = myId != null && session.instructorId === myId;
  const canInst = admin; // 강사 출결 CRUD = 매니저만(강사는 본인 것도 열람만)
  const canStudent = admin || ownSession; // 학생 출결·피드백 = 매니저 or 담당 강사
  const paid = countsForPay(session);

  const markInst = (st: InstructorAttendanceStatus) => updateSchedule.mutate({ id: sessionId, body: { instructorAttendance: st } });
  const clearInst = () => updateSchedule.mutate({ id: sessionId, body: { clearInstructorAttendance: true } });
  const attOf = (stuId: number): AttendanceStatus | undefined => attendance.find((a) => a.sessionId === sessionId && a.studentId === stuId)?.status;
  const markStu = (stuId: number, st: AttendanceStatus) => upsert.mutate({ sessionId, studentId: stuId, status: st });

  return (
    <div className="p-6 max-w-[920px] mx-auto space-y-6">
      <div>
        <Link href="/sessions" className="text-caption text-fg-muted hover:underline">← 수업 목록</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-title font-bold">{course?.name ?? "수업"} · {shortDate(session.sessionDate)}</h1>
          <Badge tone={statusTone[session.status] ?? "neutral"}>{statusLabel[session.status] ?? session.status}</Badge>
        </div>
        <p className="text-body text-fg-muted mt-0.5">
          강사 {instructor?.name ?? "—"} · {session.startTime ?? "시간 미정"} · {session.durationMinutes}분 · {session.topic ?? "주제 미정"}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="학생" value={`${roster.length}명`} />
        <StatCard label="회차 상태" value={statusLabel[session.status] ?? session.status} />
        <StatCard label="강사 출결" value={session.instructorAttendance ? (INSTRUCTOR_ATT_OPTIONS.find((o) => o.value === session.instructorAttendance)?.label ?? "—") : "미표시"} />
        <StatCard label="시수 인정" value={paid ? `${Math.round((session.durationMinutes / 60) * 100) / 100}h` : "제외"} tone={paid ? "accent" : undefined} />
      </div>

      {/* ① 강사 출결 (매니저 CRUD · 강사 열람) — AttMarker 재사용 */}
      <SectionCard title="강사 출결">
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <AttMarker value={session.instructorAttendance} options={INSTRUCTOR_ATT_OPTIONS} canEdit={canInst} pending={updateSchedule.isPending} onMark={markInst} onClear={clearInst} />
          <span className="text-caption text-fg-subtle">
            {paid ? "시수 인정(진행·결석 아님)" : `시수 제외${session.instructorAttendance === "absent" ? "(결석)" : session.status === "makeup" ? "(보강)" : session.status !== "held" ? `(${statusLabel[session.status] ?? session.status})` : ""}`}
          </span>
          {!canInst && <span className="text-caption text-fg-subtle ml-auto">열람 전용 (수정은 매니저)</span>}
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
    </div>
  );
}
