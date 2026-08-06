// [참조/처리] 리포트 작성(한 페이지) — 읽기=TanStack Query 단일 소스
//  (useSchedule·useCourses·useInstructors·useEnrollments·useStudents·useReports).
//  쓰기=useCreateReport/useSubmitReport(보고서는 session×student 단일). 템플릿은 클라 상태(store 유지).
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import {
  useSchedule, useCourses, useSubjects, useInstructors, useEnrollments, useStudents, useReports,
  useReportWorklist,
} from '@/lib/queries';
import { SessionFeedbackForm } from '@/features/reports/SessionFeedbackForm';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { rosterStudentIds } from '@/lib/reports';
import type { ClassSession, Student } from '@/types';
import type { ReportWorklistQuery } from '@kms545487/contracts';
import { ReportFilterBar } from './ReportFilterBar';
import { filterReportSessions, hasActiveReportFilters } from '@/lib/domain/report-filters';

// [TBO-34 C3] 상태 표기 = session-shared 단일 진실원(사본 제거)
import { sessionStatusLabel, sessionStatusTone } from '@/features/sessions/session-shared';

// 한 페이지 리포트 작성 — 강사의 진행중 모든 수업·학생을 좌(목록)/우(인라인 작성)로.
export function ReportWriteView() {
  const access = useAccountAccess();
  if (!access.can('report.write')) { // [TBO-86I-2] 작성 표면 공통 capability — BE write command와 동일 판정
    return (
      <div className="p-6 max-w-page mx-auto">
        <SectionCard title="리포트 작성">
          <div className="p-4 text-body text-fg-muted">
            리포트 작성 권한이 없습니다.
          </div>
        </SectionCard>
      </div>
    );
  }
  return <InstructorReportWriteSurface />;
}

function InstructorReportWriteSurface() {
  const access = useAccountAccess();
  const { data: instructors = [] } = useInstructors();
  const { data: courses = [] } = useCourses();
  const { data: subjects = [] } = useSubjects();
  const { data: classSessions = [] } = useSchedule();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const [filters, setFilters] = useState<ReportWorklistQuery>({});
  // [TBO-87] 본인 강제 스코프는 순수 강사만 — 겸직 매니저는 instructor.self가 참(roles 합성)이어도
  //  매니저 대리 작성 표면(강사 필터 포함 전체 워크리스트)을 유지한다(합성은 축소가 아니다).
  const selfScopeInstructorId = access.can('admin.area') ? null : access.instructorId;
  const effectiveFilters = useMemo<ReportWorklistQuery>(
    () => selfScopeInstructorId == null ? filters : { ...filters, instructorId: undefined },
    [selfScopeInstructorId, filters],
  );
  const { data: sessionReports = [] } = useReports(effectiveFilters);
  const { data: worklist } = useReportWorklist(effectiveFilters);
  const hasFilters = hasActiveReportFilters(effectiveFilters);
  const instructorId = selfScopeInstructorId ?? filters.instructorId;
  const instructorName = instructorId == null
    ? '전체 강사'
    : `${instructors.find((i) => i.id === instructorId)?.name ?? '선택한 강사'} 강사`;
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';

  const sessions = useMemo(
    () =>
      filterReportSessions({
        sessions: classSessions,
        courses,
        enrollments,
        reports: sessionReports,
        query: { ...effectiveFilters, instructorId },
      })
        .sort((a, b) => (b.sessionDate + (b.startTime ?? '')).localeCompare(a.sessionDate + (a.startTime ?? ''))),
    [classSessions, courses, effectiveFilters, enrollments, instructorId, sessionReports],
  );

  // 로스터 = 명시 세션 코호트 우선, 없으면 활성 수강(contracts 순수 함수).
  const rosterOf = (session: Pick<ClassSession, 'courseId' | 'studentIds'>): Student[] =>
    rosterStudentIds({ enrollments }, session)
      .filter((id) => effectiveFilters.studentId == null || id === effectiveFilters.studentId)
      .map((id) => students.find((s) => s.id === id))
      .filter((s): s is Student => Boolean(s));

  const reportFor = (sid: number, stid: number) =>
    sessionReports.find((r) => r.sessionId === sid && r.studentId === stid);

  const progressOf = (s: ClassSession) => {
    const roster = rosterOf(s);
    const done = roster.filter((st) => { const r = reportFor(s.id, st.id); return r && r.status !== 'draft'; }).length;
    return { done, total: roster.length };
  };

  const worklistSessionIds = useMemo(
    () => new Set((worklist?.items ?? []).map((item) => item.sessionId)),
    [worklist],
  );
  // 작성 필요 목록과 배지는 같은 서버 worklist 응답을 사용한다.
  const needSessions = useMemo(() => sessions.filter((session) => worklistSessionIds.has(session.id)), [sessions, worklistSessionIds]);
  const needItemCount = worklist?.itemCount ?? 0;
  const [needOnly, setNeedOnly] = useState(true);
  const listSessions = needOnly ? needSessions : sessions;

  // 기본 선택: 리포트가 필요한 첫 진행완료 수업 (단일 소스: lib/reports)
  const firstNeed = needSessions[0];
  const [selId, setSelId] = useState<number | undefined>();
  const effectiveSelId = selId ?? firstNeed?.id ?? sessions[0]?.id;
  const selected = sessions.find((s) => s.id === effectiveSelId);
  const roster = selected ? rosterOf(selected) : [];

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-title font-bold">리포트 작성</h1>
          <p className="text-body text-fg-muted mt-0.5">{instructorName} · 진행중인 모든 수업·학생을 한 페이지에서 작성하세요.</p>
        </div>
        <Link href="/reports" className="btn btn-sm">← 캘린더로</Link>
      </div>
      <ReportFilterBar
        filters={filters}
        onChange={(next) => { setFilters(next); setSelId(undefined); }}
        students={students}
        subjects={subjects}
        instructors={instructors}
        showInstructor={access.can('approval.manage')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* 좌: 내 수업 목록 — 기본은 배지와 동일 기준(작성 필요)만 */}
        <SectionCard
          title={needOnly
            ? `작성 필요 — 수업 ${needSessions.length}개 · 보고서 ${needItemCount}건 (${hasFilters ? '필터 결과' : '배지 기준'})`
            : `내 수업 (${sessions.length})`}
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
              const need = worklistSessionIds.has(s.id);
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
