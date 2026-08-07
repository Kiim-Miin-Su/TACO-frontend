// [참조/처리] 수업 보고서 캘린더/리스트 — 읽기 전용. 모든 서버 데이터는 TanStack Query 단일 소스
//  (useSchedule·useCourses·useInstructors·useEnrollments·useStudents·useReports·useAttendance).
//  미작성 판정은 서버 worklist(items)가 단일 진실원 — 클라 재계산 없음(SSOT 감사 2026-08-07 주석 정정).
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, LoadingState, ModalShell, SectionCard, PageHeader, type Tone } from '@/components/ui';
import { internalRoute } from '@/lib/navigation-security';
import { INSTRUCTOR_ATT_OPTIONS } from '@/features/attendance/AttMarker';
import {
  useSchedule, useCourses, useSubjects, useInstructors, useEnrollments, useStudents, useReports,
  useReportWorklist, useAttendance,
} from '@/lib/queries';
import { rosterStudentIds } from '@/lib/reports';
import { useAccountAccess } from '@/lib/useAccountAccess';
import type { AttendanceStatus, ReportStatus } from '@/types';

const attLabel: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석', excused: '인정결석' };
const attTone: Record<AttendanceStatus, Tone> = { present: 'success', late: 'attention', absent: 'danger', excused: 'done' };
const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };
import { WEEKDAYS_KO as WEEK, pad2 as pad } from '@/lib/domain/schedule';
import type { ReportWorklistQuery } from '@kms545487/contracts';
import { ReportFilterBar } from './ReportFilterBar';
import { filterReportSessions, hasActiveReportFilters } from '@/lib/domain/report-filters';

export function ReportsCalendarView() {
  const access = useAccountAccess();
  const [filters, setFilters] = useState<ReportWorklistQuery>({});
  // [B6 C3 2026-07-16] isPending 구독 — 로드 중 "…없습니다" 깜빡임 방지(E0.6 H2 규칙). 주 쿼리=schedule.
  const { data: classSessions = [], isPending: loadingSessions } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructors();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: sessionReports = [] } = useReports(filters);
  const { data: worklist, isPending: loadingWorklist } = useReportWorklist(filters);
  const { data: attendance = [] } = useAttendance();
  const hasFilters = hasActiveReportFilters(filters);
  const filteredSessions = filterReportSessions({
    sessions: classSessions,
    courses,
    enrollments,
    reports: sessionReports,
    query: filters,
  });
  const pendingIds = new Set((worklist?.items ?? []).map((item) => item.sessionId));
  const pendingSessions = filteredSessions.filter((session) => pendingIds.has(session.id));
  // 초기 달 = 오늘(과거 하드코딩 금지 — 2026-06 고정으로 배지·리스트가 어긋나 보이던 원인 중 하나)
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<number | null>(null);

  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const sessionsOn = (day: number) =>
    filteredSessions.filter((cs) => cs.sessionDate === `${monthStr}-${pad(day)}`);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const move = (delta: number) => {
    const dt = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
    setSelected(null);
  };

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';
  const instructorName = (id: number | null) => id == null ? '배정중' : (instructors.find((i) => i.id === id)?.name ?? '—');

  const session = selected != null ? filteredSessions.find((s) => s.id === selected) : undefined;
  // 로스터 = 명시 세션 코호트 우선, 없으면 활성 수강(contracts 순수 함수).
  const roster = session
    ? rosterStudentIds({ enrollments }, session)
        .filter((id) => filters.studentId == null || id === filters.studentId)
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
    : [];

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="수업 보고서"
        sub="캘린더·리스트에서 수업을 선택해 확인하거나, 한 페이지에서 바로 작성하세요."
        actions={access.can('report.write') // [TBO-86I-2] 작성 CTA — BE write command와 동일 판정
          ? <Link href="/reports/write" className="btn btn-primary">리포트 작성하기</Link>
          : undefined}
      />

      <ReportFilterBar
        filters={filters}
        onChange={(next) => { setFilters(next); setSelected(null); }}
        students={students}
        subjects={subjects}
        instructors={instructors}
        showInstructor={access.can('approval.manage')}
      />

      <SectionCard
        title={`${ym.y}년 ${ym.m + 1}월`}
        action={
          <div className="flex gap-1.5">
            <button className="btn btn-sm" onClick={() => move(-1)}>← 이전</button>
            <button className="btn btn-sm" onClick={() => move(1)}>다음 →</button>
          </div>
        }
      >
        <div className="grid grid-cols-7 border-b">
          {WEEK.map((w, i) => (
            <div key={w} className={`px-3 py-2 text-caption font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-accent' : 'text-fg-muted'}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const list = day ? sessionsOn(day) : [];
            return (
              <div
                key={idx}
                className="min-h-[92px] border-b border-r p-1.5 border-line-muted"
              >
                {day && <div className="text-caption text-fg-subtle mb-1 px-1">{day}</div>}
                <div className="space-y-1">
                  {list.map((cs) => {
                    const active = cs.id === selected;
                    return (
                      <button
                        key={cs.id}
                        onClick={() => setSelected(cs.id)}
                        className="w-full text-left rounded px-1.5 py-1 text-micro font-medium truncate"
                        style={{
                          backgroundColor: active ? 'var(--color-accent)' : 'var(--color-accent-subtle)',
                          color: active ? '#fff' : 'var(--color-accent)',
                        }}
                        title={courseName(cs.courseId) + (pendingIds.has(cs.id) ? ' · 리포트 미작성' : '')}
                      >
                        {/* 미작성(배지 모집단) 수업은 빨간 점으로 표시 — 리스트·배지와 같은 기준 */}
                        {pendingIds.has(cs.id) && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle bg-danger" />
                        )}
                        {courseName(cs.courseId)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* [TBO-89 owner 지시] "작성 필요만" 토글 제거 — 미작성 수업 전부가 기본 리스트다(배지와 같은
          서버 worklist 모집단·전체 기간). 필터바(기간·학생·과목·강사)가 그대로 이 목록을 좁힌다.
          행 클릭 = 리포트 모달(강사·학생 출결 포함) + 상세 페이지 링크. */}
      {(() => {
        const needSessions = [...pendingSessions]
          .sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? '')));
        return (
          <SectionCard
            title={`작성 필요 — 수업 ${worklist?.sessionCount ?? 0}개 · 보고서 ${worklist?.itemCount ?? 0}건 (${hasFilters ? '필터 결과' : '배지 기준'})`}
          >
            {loadingSessions || loadingWorklist ? (
              <LoadingState />
            ) : needSessions.length === 0 ? (
              /* [B6 C3 2026-07-16] 자체 div 빈 상태 → EmptyState 규격 */
              <EmptyState message="작성할 리포트가 없습니다. (진행완료·지난 수업 모두 작성됨)" />
            ) : (
              <table className="table">
                <thead><tr><th>날짜</th><th>수업</th><th>강사</th><th className="text-right">리포트</th><th></th></tr></thead>
                <tbody>
                  {needSessions.map((s) => {
                    const ids = rosterStudentIds({ enrollments }, s)
                      .filter((id) => filters.studentId == null || id === filters.studentId);
                    const done = sessionReports.filter((r) => r.sessionId === s.id && ids.includes(r.studentId) && r.status !== 'draft').length;
                    return (
                      <tr key={s.id} className={`cursor-pointer ${s.id === selected ? 'bg-accent-subtle' : 'hover:bg-canvas-subtle'}`} onClick={() => setSelected(s.id)}>
                        <td className="mono text-fg-muted">{s.sessionDate} {s.startTime ?? ''}</td>
                        <td className="font-medium">{courseName(s.courseId)}</td>
                        <td className="text-fg-muted">{instructorName(s.instructorId)}</td>
                        <td className="text-right mono">{done}/{ids.length}</td>
                        <td className="text-right whitespace-nowrap">
                          <button className="btn btn-sm mr-1" onClick={(event) => { event.stopPropagation(); setSelected(s.id); }}>보기</button>
                          <Link href="/reports/write" className="btn btn-sm btn-primary" onClick={(event) => event.stopPropagation()}>작성</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        );
      })()}

      {/* [TBO-89] 인라인 카드 → 공용 ModalShell — 강사·학생 출결 포함 + 상세 페이지 링크(출결·리포트
          전체는 세션 상세 허브가 원 화면 — 같은 데이터 훅을 공유하므로 재계산·이중 소스 없음). */}
      {session && (() => {
        const instAtt = session.instructorAttendance
          ? INSTRUCTOR_ATT_OPTIONS.find((option) => option.value === session.instructorAttendance)
          : undefined;
        return (
          <ModalShell
            title={`${courseName(session.courseId)} · ${session.sessionDate} ${session.startTime ?? ''}`}
            size="lg"
            onClose={() => setSelected(null)}
            footer={(
              <>
                <button className="btn btn-sm" onClick={() => setSelected(null)}>닫기</button>
                <Link href={internalRoute.session(session.id)} className="btn btn-sm btn-primary">상세 페이지</Link>
              </>
            )}
          >
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-body">
              <span className="text-fg-muted">강사</span>
              <span className="font-medium">{instructorName(session.instructorId)}</span>
              <Badge tone={(instAtt?.tone as Tone) ?? 'neutral'}>{instAtt ? `강사 ${instAtt.label}` : '강사 출결 미기록'}</Badge>
            </div>
            <div className="divide-y border-line-muted">
              {roster.map((student) => {
                const att = attendance.find((a) => a.sessionId === session.id && a.studentId === student.id);
                const report = sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
                return (
                  <div key={student.id} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{student.name}</span>
                      <span className="text-caption text-fg-subtle">{student.englishName}</span>
                      {att ? <Badge tone={attTone[att.status]}>{attLabel[att.status]}</Badge> : <Badge tone="neutral">출결 미기록</Badge>}
                      {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
                    </div>
                    {report?.content ? (
                      <div className="text-body text-fg whitespace-pre-wrap">{report.content}</div>
                    ) : (
                      <div className="text-body text-fg-subtle">작성된 피드백 없음</div>
                    )}
                    {report?.homework && (
                      <div className="text-caption text-fg-muted mt-1.5">숙제 · {report.homework}</div>
                    )}
                  </div>
                );
              })}
              {/* [B6 C3 2026-07-16] 자체 div 빈 상태 → EmptyState 규격 */}
              {roster.length === 0 && <EmptyState message="수강생이 없습니다." />}
            </div>
          </ModalShell>
        );
      })()}
    </div>
  );
}
