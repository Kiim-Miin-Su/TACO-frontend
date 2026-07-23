'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useCourse(id) + DetailStates) — full-list find 제거(EP16)
// [TBO-20 20-C] 코스 상세 — 수강생·세션 종합. 관리자 전용(AdminGuard).
//  참조 무결성: 단일 소스 Query에서 코스 FK로 조립(수강=enrollments, 세션=schedule).
//  유령 courseId는 단건 404 → DetailStates가 구분 렌더. 읽기 위주(편집은 카탈로그·캘린더·수강 화면).
import { useMemo } from 'react';
import Link from 'next/link';
import { Badge, DetailStates, EmptyState, PageHeader, SectionCard, StatCard, TableWrap, type Tone } from '@/components/ui';
import {
  useCourse, useSubjects, useInstructorAdminList, useEnrollments, useStudents,
  useSchedule,
} from '@/lib/queries';
import { won, shortDate } from '@/lib/format';
import type { EnrollmentStatus } from '@/types';
import { AdminGuard } from './AdminShell';

// [TBO-34 C3] 상태 표기 = 단일 진실원 소비(세션·수강 사본 제거)
import { sessionStatusLabel, sessionStatusTone } from '@/features/sessions/session-shared';
import { ENROLLMENT_STATUS_LABEL as enrollLabel, ENROLLMENT_STATUS_TONE as enrollTone } from '@/lib/domain/enrollments';

export function CourseDetailView({ courseId }: { courseId: number }) {
  const courseQuery = useCourse(courseId);
  // 과목·강사 이름 조인: 코스 단건 응답은 raw Course(이름 필드 없음) → 카탈로그 훅 유지.
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructorAdminList();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const { data: sessions = [] } = useSchedule();

  const studentName = (id: number) => students.find((s) => s.id === id)?.name ?? `학생#${id}`;

  const roster = useMemo(() => enrollments.filter((e) => e.courseId === courseId), [enrollments, courseId]);
  const courseSessions = useMemo(
    () => sessions.filter((s) => s.courseId === courseId).sort((a, b) => (b.sessionDate + (b.startTime ?? '')).localeCompare(a.sessionDate + (a.startTime ?? ''))),
    [sessions, courseId],
  );

  const activeCount = roster.filter((e) => e.status === 'active').length;
  const heldCount = courseSessions.filter((s) => s.status === 'held').length;

  return (
    <AdminGuard>
      <div className="p-6 max-w-page mx-auto space-y-6">
        <DetailStates query={courseQuery} notFoundMessage={`코스(id ${courseId})를 찾을 수 없습니다.`} backHref="/admin/courses" backLabel="코스 카탈로그">
          {(course) => (
            <>
              <div>
                <Link href="/admin/courses" className="text-caption text-fg-muted hover:underline">← 코스 카탈로그</Link>
                <PageHeader
                  title={course.name}
                  sub={[subjects.find((s) => s.id === course.subjectId)?.name, `강사 ${instructors.find((i) => i.id === course.instructorId)?.name ?? '—'}`, `정가 ${won(course.price)}`, `시급 ${won(course.hourlyRate)} (${course.hourlyRateOverride == null ? '강사 기본' : '수업 override'})`, course.isKinder ? 'Kinder' : null].filter(Boolean).join(' · ')}
                  actions={course.color && <span className="inline-block w-4 h-4 rounded-full" style={{ background: course.color }} />}
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

              <SectionCard title={`세션 (${courseSessions.length})`} action={<Link href="/calendar" className="btn btn-sm">캘린더 →</Link>}>
                {!courseSessions.length ? <EmptyState message="세션이 없습니다." /> : (
                  <div className="divide-y border-line-muted max-h-[360px] overflow-y-auto">
                    {courseSessions.map((s) => (
                      <Link key={s.id} href={`/sessions/${s.id}`} className="flex items-center gap-x-3 p-2.5 hover:bg-canvas-subtle">
                        <span className="mono text-caption">{s.sessionDate}</span>
                        <span className="text-caption text-fg-muted">{s.startTime ?? '—'}</span>
                        <Badge tone={sessionStatusTone(s.status) ?? 'neutral'}>{sessionStatusLabel(s.status) ?? s.status}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>

              <p className="text-caption text-fg-subtle">읽기 전용 종합 뷰 — 편집은 카탈로그·캘린더·수강 화면에서.</p>
            </>
          )}
        </DetailStates>
      </div>
    </AdminGuard>
  );
}
