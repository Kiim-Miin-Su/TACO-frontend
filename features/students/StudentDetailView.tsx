'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useStudent(id) + DetailStates) — full-list find 제거(EP6/EP11)
// [TBO-20 20-A] 학생 상세 — 프로필 허브. 수강·학부모·결제·상담·출결/보고서를 한 곳에.
//  참조 무결성: 주 엔티티=단건 Query(useStudent), 관련 섹션=단일 소스 Query(useEnrollments/...)에서 학생 FK로 조립 — 세션/데이터 복제 없음.
//   · 로딩/404/403/오류는 DetailStates가 구분 렌더 — 유령 참조 차단(자체 가드 제거).
//   · 읽기 전용(편집은 각 도메인 화면 — 결제·상담·출결부). 여기선 종합 열람만.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, DetailStates, EmptyState, PageHeader, SectionCard, StatCard, TableWrap, type Tone } from '@/components/ui';
import {
  useStudent, useEnrollments, useCourses, useParentStudents, useParents,
  useAttendance, useReports, usePayments, useCounselForms,
} from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { STUDENT_STATUS_LABEL, STUDENT_STATUS_TONE } from '@/lib/domain/students';
import { won, shortDate } from '@/lib/format';
import { CountryBadge } from '@/features/calendar/CountryInput';
import { statusLabel as payLabel, statusTone as payTone } from '@/features/payments/labels';
import { statusLabel as counselLabel, statusTone as counselTone } from '@/features/counsel/labels';
import type { EnrollmentStatus } from '@/types';
import { StudentProfileEditModal } from './StudentProfileEditModal';

const enrollTone: Record<EnrollmentStatus, Tone> = { active: 'success', paused: 'attention', completed: 'done', canceled: 'danger' };
const enrollLabel: Record<EnrollmentStatus, string> = { active: '수강중', paused: '일시정지', completed: '수료', canceled: '취소' };

export function StudentDetailView({ studentId }: { studentId: number }) {
  const access = useAccountAccess();
  const finance = access.can('finance.access');
  const canEdit = access.can('admin.area');
  const [editing, setEditing] = useState(false);
  const studentQuery = useStudent(studentId);
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const { data: attendance = [] } = useAttendance();
  const { data: reports = [] } = useReports();
  const { data: payments = [] } = usePayments();
  const { data: counselForms = [] } = useCounselForms();

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `코스#${id}`;

  const myEnrollments = useMemo(() => enrollments.filter((e) => e.studentId === studentId), [enrollments, studentId]);
  const myPayments = useMemo(() => payments.filter((p) => p.studentId === studentId), [payments, studentId]);
  const myCounsel = useMemo(() => counselForms.filter((c) => c.studentId === studentId), [counselForms, studentId]);
  const myAttendance = useMemo(() => attendance.filter((a) => a.studentId === studentId), [attendance, studentId]);
  const myReports = useMemo(() => reports.filter((r) => r.studentId === studentId), [reports, studentId]);
  const myParents = useMemo(
    () => parentStudents.filter((ps) => ps.studentId === studentId).map((ps) => ({ rel: ps.relation, primary: ps.isPrimary, parent: parents.find((p) => p.id === ps.parentId) })).filter((x) => x.parent),
    [parentStudents, parents, studentId],
  );

  const activeCount = myEnrollments.filter((e) => e.status === 'active').length;
  const paidTotal = myPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);
  const unpaidTotal = myPayments.filter((p) => p.status === 'pending' || p.status === 'overdue').reduce((s, p) => s + p.amount, 0);
  const attCounts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    myAttendance.forEach((a) => { if (a.status in c) c[a.status as keyof typeof c]++; });
    return c;
  }, [myAttendance]);

  return (
    <div className="p-6 max-w-page mx-auto">
      <DetailStates query={studentQuery} notFoundMessage="학생을 찾을 수 없습니다." backHref="/students">
        {(student) => (
          <div className="space-y-6">
            <div>
              <Link href="/students" className="text-caption text-fg-muted hover:underline">← 학생 목록</Link>
              <PageHeader
                title={`${student.name}${student.englishName ? ` (${student.englishName})` : ''}`}
                sub={[student.grade != null ? `${student.grade}학년` : null, student.schoolName, student.phone, student.webId ? `ID ${student.webId}` : '미가입']
                  .filter(Boolean).join(' · ')}
                actions={
                  <span className="flex items-center gap-2 flex-wrap">
                    <Badge tone={(STUDENT_STATUS_TONE[student.status] as Tone)}>{STUDENT_STATUS_LABEL[student.status]}</Badge>
                    <CountryBadge code={student.country} />
                    {canEdit && <button className="btn btn-sm" onClick={() => setEditing(true)}>정보 수정</button>}
                  </span>
                }
              />
              {editing && <StudentProfileEditModal student={student} onClose={() => setEditing(false)} />}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="활성 수강" value={`${activeCount}개`} tone="accent" />
              {finance && <StatCard label="누적 결제" value={won(paidTotal)} tone="success" />}
              {finance && <StatCard label="미납" value={won(unpaidTotal)} tone={unpaidTotal ? 'danger' : undefined} />}
              <StatCard label="출석/지각/결석" value={`${attCounts.present}/${attCounts.late}/${attCounts.absent}`} />
              <StatCard label="보고서" value={`${myReports.length}건`} />
              <StatCard label="상담 이력" value={`${myCounsel.length}건`} />
            </div>

            <SectionCard title={`수강 코스 (${myEnrollments.length})`}>
              {!myEnrollments.length ? <EmptyState message="수강 이력이 없습니다." /> : (
                <TableWrap minWidth={640}>
                  <table className="table">
                    <thead><tr><th>코스</th><th>상태</th><th>진도</th><th>등록일</th></tr></thead>
                    <tbody>
                      {myEnrollments.map((e) => (
                        <tr key={e.id}>
                          <td className="font-medium">{courseName(e.courseId)}</td>
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
              <SectionCard title={`학부모 (${myParents.length})`}>
                {!myParents.length ? <EmptyState message="연결된 학부모가 없습니다." /> : (
                  <div className="divide-y border-line-muted">
                    {myParents.map((p, i) => (
                      <div key={i} className="p-3 flex items-center gap-x-3 flex-wrap text-body">
                        <span className="font-medium">{p.parent!.name}</span>
                        <span className="text-caption text-fg-subtle">{p.rel ?? '보호자'}{p.primary ? ' · 주보호자' : ''}</span>
                        <span className="text-fg-muted mono ml-auto">{p.parent!.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title={`상담 이력 (${myCounsel.length})`} action={<Link href="/counsel" className="btn btn-sm">상담 전체 →</Link>}>
                {!myCounsel.length ? <EmptyState message="상담 이력이 없습니다." /> : (
                  <div className="divide-y border-line-muted">
                    {myCounsel.map((c) => (
                      <div key={c.id} className="p-3 flex items-center gap-x-3 flex-wrap">
                        <Link href={`/counsel/${c.id}`} className="text-accent hover:underline font-medium">{c.applicantName}</Link>
                        <Badge tone={counselTone[c.status]}>{counselLabel[c.status]}</Badge>
                        {c.interestCourseId && <span className="text-caption text-fg-muted">{courseName(c.interestCourseId)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {finance && (
              <SectionCard title={`결제 내역 (${myPayments.length})`} action={<Link href="/payments" className="btn btn-sm">결제 전체 →</Link>}>
                {!myPayments.length ? <EmptyState message="결제 내역이 없습니다." /> : (
                  <TableWrap minWidth={640}>
                    <table className="table">
                      <thead><tr><th>금액</th><th>상태</th><th>수단</th><th>납부일</th><th className="text-right"></th></tr></thead>
                      <tbody>
                        {myPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="mono font-medium">{won(p.amount)}{p.paidAmount != null && p.paidAmount !== p.amount ? ` (납 ${won(p.paidAmount)})` : ''}</td>
                            <td><Badge tone={payTone[p.status]}>{payLabel[p.status]}</Badge></td>
                            <td className="text-fg-muted">{p.paymentMethod ?? '—'}</td>
                            <td className="mono text-fg-muted">{p.paidAt ? shortDate(p.paidAt) : p.dueAt ? `~${shortDate(p.dueAt)}` : '—'}</td>
                            <td className="text-right"><Link href={`/payments/${p.id}`} className="btn btn-sm">상세</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </SectionCard>
            )}

            <p className="text-caption text-fg-subtle">학생 기본정보는 관리자만 이 화면에서 수정합니다. 결제·상담·출결은 각 도메인 화면의 권위 데이터를 사용합니다.</p>
          </div>
        )}
      </DetailStates>
    </div>
  );
}
