// [참조/처리] 리포트 작성(한 페이지) — 읽기=TanStack Query 단일 소스
//  (useSchedule·useCourses·useInstructors·useEnrollments·useStudents·useReports).
//  쓰기=useCreateReport/useSubmitReport(보고서는 session×student 단일). 템플릿은 클라 상태(store 유지).
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useSchedule, useCourses, useInstructors, useEnrollments, useStudents, useReports } from '@/lib/queries';
import { SessionFeedbackForm } from '@/features/reports/SessionFeedbackForm';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { pendingReportSummary, rosterStudentIds, sessionNeedsReport } from '@/lib/reports';
import type { ClassSession, Student } from '@/types';

// [TBO-34 C3] 상태 표기 = session-shared 단일 진실원(사본 제거)
import { sessionStatusLabel, sessionStatusTone } from '@/features/sessions/session-shared';

// 한 페이지 리포트 작성 — 강사의 진행중 모든 수업·학생을 좌(목록)/우(인라인 작성)로.
export function ReportWriteView() {
  const access = useAccountAccess();
  const { data: instructors = [] } = useInstructors();
  const { data: courses = [] } = useCourses();
  const { data: classSessions = [] } = useSchedule();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: sessionReports = [] } = useReports();
  // sessionNeedsReport용 slice(단일 소스 조립)
  const reportSlice = useMemo(
    () => ({ classSessions, enrollments, sessionReports }),
    [classSessions, enrollments, sessionReports],
  );
  const instructorId = access.instructorId;
  const instructorName = instructors.find((i) => i.id === instructorId)?.name ?? '강사';
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';

  const sessions = useMemo(
    () =>
      classSessions
        .filter((s) => instructorId != null && s.instructorId === instructorId)
        .sort((a, b) => (b.sessionDate + (b.startTime ?? '')).localeCompare(a.sessionDate + (a.startTime ?? ''))),
    [classSessions, instructorId],
  );

  // 로스터 = lib/reports.rosterStudentIds(활성 수강만) — 배지·미작성 집계와 같은 모집단(단일 소스).
  const rosterOf = (courseId: number): Student[] =>
    rosterStudentIds({ enrollments }, courseId)
      .map((id) => students.find((s) => s.id === id))
      .filter((s): s is Student => Boolean(s));

  const reportFor = (sid: number, stid: number) =>
    sessionReports.find((r) => r.sessionId === sid && r.studentId === stid);

  const progressOf = (s: ClassSession) => {
    const roster = rosterOf(s.courseId);
    const done = roster.filter((st) => { const r = reportFor(s.id, st.id); return r && r.status !== 'draft'; }).length;
    return { done, total: roster.length };
  };

  // 배지와 동일 기준의 "작성 필요"(held·지난 수업·미작성) 목록. 기본은 이 목록만 노출(배지=리스트 일치).
  // 전체 보기로 전환하면 예정·완료 수업도 열어 편집 가능.
  const needSessions = useMemo(() => sessions.filter((s) => sessionNeedsReport(reportSlice, s)), [sessions, reportSlice]);
  // 강사 배지와 같은 숫자(보고서 건수) — 같은 모집단(pendingReportSummary) 사용.
  const needItemCount = useMemo(
    () => pendingReportSummary(reportSlice, instructorId ?? undefined).itemCount,
    [reportSlice, instructorId],
  );
  const [needOnly, setNeedOnly] = useState(true);
  const listSessions = needOnly ? needSessions : sessions;

  // 기본 선택: 리포트가 필요한 첫 진행완료 수업 (단일 소스: lib/reports)
  const firstNeed = needSessions[0];
  const [selId, setSelId] = useState<number | undefined>();
  const effectiveSelId = selId ?? firstNeed?.id ?? sessions[0]?.id;
  const selected = sessions.find((s) => s.id === effectiveSelId);
  const roster = selected ? rosterOf(selected.courseId) : [];

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-title font-bold">리포트 작성</h1>
          <p className="text-body text-fg-muted mt-0.5">{instructorName} 강사 · 진행중인 모든 수업·학생을 한 페이지에서 작성하세요.</p>
        </div>
        <Link href="/reports" className="btn btn-sm">← 캘린더로</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* 좌: 내 수업 목록 — 기본은 배지와 동일 기준(작성 필요)만 */}
        <SectionCard
          title={needOnly ? `작성 필요 — 수업 ${needSessions.length}개 · 보고서 ${needItemCount}건` : `내 수업 (${sessions.length})`}
          action={
            <button className="btn btn-sm" onClick={() => setNeedOnly((v) => !v)}>
              {needOnly ? '전체 보기' : '작성 필요만'}
            </button>
          }
        >
          <ul className="divide-y max-h-[68vh] overflow-y-auto border-line-muted">
            {listSessions.map((s) => {
              const p = progressOf(s);
              const active = s.id === selId;
              const need = sessionNeedsReport(reportSlice, s);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelId(s.id)}
                    className={`w-full text-left px-3 py-2.5 ${active ? 'bg-accent-subtle' : 'hover:bg-canvas-subtle'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium truncate flex-1">{courseName(s.courseId)}</span>
                      {need && <span className="w-2 h-2 rounded-full shrink-0 bg-danger" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-micro text-fg-subtle mono">{s.sessionDate} {s.startTime ?? ''}</span>
                      <Badge tone={sessionStatusTone(s.status) ?? 'neutral'}>{sessionStatusLabel(s.status) ?? s.status}</Badge>
                      <span className="text-micro text-fg-subtle ml-auto">{p.done}/{p.total}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {listSessions.length === 0 && (
              <li className="p-4 text-body text-fg-subtle">
                {needOnly ? '작성할 리포트가 없습니다. (진행완료·지난 수업 모두 작성됨)' : '담당 수업이 없습니다.'}
              </li>
            )}
          </ul>
        </SectionCard>

        {/* 우: 선택 수업의 학생별 인라인 작성 */}
        <div className="space-y-3">
          {!selected ? (
            <SectionCard title="작성"><div className="p-4 text-body text-fg-subtle">왼쪽에서 수업을 선택하세요.</div></SectionCard>
          ) : (
            <SectionCard
              title={`${courseName(selected.courseId)} · ${selected.sessionDate} ${selected.startTime ?? ''}`}
              action={<Badge tone={sessionStatusTone(selected.status) ?? 'neutral'}>{sessionStatusLabel(selected.status) ?? selected.status}</Badge>}
            >
              {selected.status !== 'held' && (
                <div className="px-4 pt-3 text-caption text-fg-subtle">진행 완료(held) 후 작성한 리포트만 시수로 측정됩니다. (현재: {sessionStatusLabel(selected.status) ?? selected.status})</div>
              )}
              <div className="divide-y border-line-muted">
                {roster.map((student) => (
                  <SessionFeedbackForm key={`${selected.id}:${student.id}`} session={selected} student={student} />
                ))}
                {roster.length === 0 && <div className="p-4 text-body text-fg-subtle">수강생이 없습니다.</div>}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
