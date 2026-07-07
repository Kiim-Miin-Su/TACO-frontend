'use client';
// [TBO-20 20-C] 코스 상세 — 수강생·세션·로드맵 종합. 관리자 전용(AdminGuard).
//  참조 무결성: 단일 소스 Query에서 코스 FK로 조립(수강=enrollments, 세션=schedule, 로드맵=roadmapCourses).
//  유령 courseId 가드. 읽기 위주(편집은 카탈로그·캘린더·수강 화면).
import { useMemo } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader, SectionCard, StatCard, TableWrap, type Tone } from '@/components/ui';
import {
  useCourses, useSubjects, useInstructors, useEnrollments, useStudents,
  useSchedule, useRoadmaps, useRoadmapCourses,
} from '@/lib/queries';
import { won, shortDate } from '@/lib/format';
import type { EnrollmentStatus } from '@/types';
import { AdminGuard } from './AdminShell';

const enrollTone: Record<EnrollmentStatus, Tone> = { active: 'success', paused: 'attention', completed: 'done', canceled: 'danger' };
const enrollLabel: Record<EnrollmentStatus, string> = { active: '수강중', paused: '일시정지', completed: '수료', canceled: '취소' };
const sessTone: Record<string, Tone> = { held: 'success', scheduled: 'accent', canceled: 'danger', no_show: 'danger', makeup: 'attention' };
const sessLabel: Record<string, string> = { held: '진행완료', scheduled: '예정', canceled: '취소', no_show: '노쇼', makeup: '보강' };

export function CourseDetailView({ courseId }: { courseId: number }) {
  const { data: courses = [], isLoading } = useCourses();
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructors();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: sessions = [] } = useSchedule();
  const { data: roadmaps = [] } = useRoadmaps();
  const { data: roadmapCourses = [] } = useRoadmapCourses();

  const course = courses.find((c) => c.id === courseId);
  const studentName = (id: number) => students.find((s) => s.id === id)?.name ?? `학생#${id}`;

  const roster = useMemo(() => enrollments.filter((e) => e.courseId === courseId), [enrollments, courseId]);
  const courseSessions = useMemo(
    () => sessions.filter((s) => s.courseId === courseId).sort((a, b) => (b.sessionDate + (b.startTime ?? '')).localeCompare(a.sessionDate + (a.startTime ?? ''))),
    [sessions, courseId],
  );
  const inRoadmaps = useMemo(
    () => roadmapCourses.filter((rc) => rc.courseId === courseId).map((rc) => roadmaps.find((r) => r.id === rc.roadmapId)).filter(Boolean),
    [roadmapCourses, roadmaps, courseId],
  );

  const activeCount = roster.filter((e) => e.status === 'active').length;
  const heldCount = courseSessions.filter((s) => s.status === 'held').length;

  return (
    <AdminGuard>
      {isLoading || course ? (
        <div className="p-6 max-w-page mx-auto space-y-6">
          <div>
            <Link href="/admin/courses" className="text-caption text-fg-muted hover:underline">← 코스 카탈로그</Link>
            <PageHeader
              title={course ? course.name : `코스 #${courseId}`}
              sub={
                course
                  ? [subjects.find((s) => s.id === course.subjectId)?.name, `강사 ${instructors.find((i) => i.id === course.instructorId)?.name ?? '—'}`, `정가 ${won(course.price)}`, `시급 ${won(course.hourlyRate)}`].filter(Boolean).join(' · ')
                  : '불러오는 중…'
              }
              actions={course?.color && <span className="inline-block w-4 h-4 rounded-full" style={{ background: course.color }} />}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="수강생" value={`${roster.length}명`} />
            <StatCard label="활성 수강" value={`${activeCount}명`} tone="accent" />
            <StatCard label="세션" value={`${courseSessions.length}회`} />
            <StatCard label="진행 완료" value={`${heldCount}회`} tone="success" />
          </div>

          <SectionCard title={`수강생 (${roster.length})`}>
            {!roster.length ? <EmptyState message="수강생이 없습니다." /> : (
              <TableWrap minWidth={560}>
                <table className="table">
                  <thead><tr><th>학생</th><th>상태</th><th>진도</th><th>등록일</th></tr></thead>
                  <tbody>
                    {roster.map((e) => (
                      <tr key={e.id}>
                        <td className="font-medium"><Link href={`/students/${e.studentId}`} className="text-accent hover:underline">{studentName(e.studentId)}</Link></td>
                        <td><Badge tone={enrollTone[e.status]}>{enrollLabel[e.status]}</Badge></td>
                        <td className="mono text-fg-muted">{e.completedSessions ?? 0}/{e.totalSessions ?? '—'}</td>
                        <td className="mono text-fg-muted">{shortDate(e.enrolledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title={`세션 (${courseSessions.length})`} action={<Link href="/calendar" className="btn btn-sm">캘린더 →</Link>}>
              {!courseSessions.length ? <EmptyState message="세션이 없습니다." /> : (
                <div className="divide-y border-line-muted max-h-[360px] overflow-y-auto">
                  {courseSessions.map((s) => (
                    <Link key={s.id} href={`/sessions/${s.id}`} className="flex items-center gap-x-3 p-2.5 hover:bg-canvas-subtle">
                      <span className="mono text-caption">{s.sessionDate}</span>
                      <span className="text-caption text-fg-muted">{s.startTime ?? '—'}</span>
                      <Badge tone={sessTone[s.status] ?? 'neutral'}>{sessLabel[s.status] ?? s.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title={`로드맵 (${inRoadmaps.length})`}>
              {!inRoadmaps.length ? <EmptyState message="연결된 로드맵이 없습니다." /> : (
                <div className="divide-y border-line-muted">
                  {inRoadmaps.map((r) => (
                    <div key={r!.id} className="p-3">
                      <div className="font-medium">{r!.title}</div>
                      {r!.description && <div className="text-caption text-fg-muted">{r!.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <p className="text-caption text-fg-subtle">읽기 전용 종합 뷰 — 편집은 카탈로그·캘린더·수강 화면에서.</p>
        </div>
      ) : (
        <div className="p-6 max-w-page mx-auto">
          <Link href="/admin/courses" className="text-caption text-fg-muted hover:underline">← 코스 카탈로그</Link>
          <PageHeader title="코스 상세" sub={`코스(id ${courseId})를 찾을 수 없습니다.`} />
        </div>
      )}
    </AdminGuard>
  );
}
