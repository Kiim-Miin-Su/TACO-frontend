// [참조/처리] 관리자 코스/과목 카탈로그. 읽기=TanStack Query(useCourses·useSubjects·useInstructors),
//  쓰기=중앙 훅(useCreateCourse/useCreateSubject) — 성공 시 해당 queryKey invalidate로 목록 자동 갱신.
//  [B6 C2] 인라인 useMutation 사설 정의 제거 — 중앙 훅만 사용(E1 불변식 2).
'use client';
// [B6 C3 2026-07-16] 행 전체 클릭 = 코스 상세(ClickableTableRow href) — 코스명 Link는 유지(중첩 제외).
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ClickableTableRow, ConfirmModal, SectionCard, EmptyState, LoadingState, TableWrap } from '@/components/ui';
import { useCourses, useSubjects, useInstructorAdminList, useRemoveCourse, useRemoveSubject } from '@/lib/queries';
import { won } from '@/lib/format';
import { internalRoute } from '@/lib/navigation-security';
import { apiErrorMessage } from '@/lib/api-error';
import { AdminGuard, AdminHeader } from './AdminShell';
// [B4 2026-07-16 대표 결정 ②] 강의실 관리 — 수업 추가 모달과 같은 공용 컴포넌트 재사용(사설 사본 금지)
import { RoomManagerPanel } from '@/features/rooms/RoomManagerPanel';
import { CourseEditModal, SubjectEditModal } from './CatalogEditModals';
import type { Course, Subject } from '@/types';
import { CourseCreateForm, SubjectCreateForm } from './catalog/CatalogCreateForms';

export function CoursesView() {
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [], isPending: loading } = useCourses(); // [E0.6 H2]
  const { data: instructors = [] } = useInstructorAdminList();
  const removeCourse = useRemoveCourse();
  const removeSubject = useRemoveSubject();
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'course' | 'subject'; id: number; name: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const subjectNames = useMemo(() => new Map(subjects.map((row) => [row.id, row.name])), [subjects]);
  const instructorNames = useMemo(() => new Map(instructors.map((row) => [row.id, row.name])), [instructors]);

  return (
    <AdminGuard>
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title="코스 추가"><CourseCreateForm /></SectionCard>
          <SectionCard title="과목 추가"><SubjectCreateForm /></SectionCard>
        </div>
        <SectionCard title={`코스 목록 (${courses.length})`}>
          {actionError && <p className="px-4 pt-3 text-caption text-danger" role="alert">{actionError}</p>}
          {loading ? (
            <LoadingState />
          ) : courses.length === 0 ? (
            <EmptyState message="등록된 코스가 없습니다. 위에서 코스를 추가하세요." />
          ) : (
          <TableWrap>
          <table className="table">
            <thead><tr><th>코스</th><th>과목</th><th>강사</th><th>수업 시급</th><th>Kinder</th><th className="text-right">정가</th><th className="text-right">관리</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <ClickableTableRow key={c.id} href={internalRoute.adminCourse(c.id)} label={`${c.name} 코스 상세`}>
                  <td className="font-medium">
                    {c.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: c.color }} />}
                    {/* [TBO-20 20-C] 코스명 클릭 → 코스 상세(수강생·세션·로드맵) */}
                    <Link href={internalRoute.adminCourse(c.id)} className="text-accent hover:underline">{c.name}</Link>
                  </td>
                  <td className="text-fg-muted">{subjectNames.get(c.subjectId) ?? '—'}</td>
                  <td className="text-fg-muted">{instructorNames.get(c.instructorId) ?? '—'}</td>
                  <td className="mono">{won(c.hourlyRate)} <span className="text-micro text-fg-subtle">{c.hourlyRateOverride == null ? '기본' : 'override'}</span></td>
                  <td>{c.isKinder ? '예' : '아니오'}</td>
                  <td className="text-right mono">{won(c.price)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm mr-1.5" onClick={() => setEditingCourse(c)}>수정</button>
                    <button className="btn btn-sm text-danger" onClick={() => setRemoving({ kind: 'course', id: c.id, name: c.name })}>삭제</button>
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
          </TableWrap>
          )}
        </SectionCard>
        <SectionCard title={`과목 목록 (${subjects.length})`}>
          {subjects.length === 0 ? <EmptyState message="등록된 과목이 없습니다." /> : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>코드</th><th>과목명</th><th className="text-right">관리</th></tr></thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject.id}>
                      <td className="mono text-fg-muted">{subject.code}</td>
                      <td className="font-medium">{subject.name}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn btn-sm mr-1.5" onClick={() => setEditingSubject(subject)}>수정</button>
                        <button className="btn btn-sm text-danger" onClick={() => setRemoving({ kind: 'subject', id: subject.id, name: subject.name })}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
        <SectionCard title="강의실 관리 (매니저 이상)"><RoomManagerPanel /></SectionCard>
        {editingCourse && <CourseEditModal course={editingCourse} subjects={subjects} instructors={instructors} onClose={() => setEditingCourse(null)} />}
        {editingSubject && <SubjectEditModal subject={editingSubject} onClose={() => setEditingSubject(null)} />}
        {removing && (
          <ConfirmModal
            title={`${removing.kind === 'course' ? '코스' : '과목'} 삭제`}
            message={`“${removing.name}”을(를) 삭제할까요? 수강·수업·상담 등에서 참조 중이면 서버가 삭제를 거부합니다.`}
            confirmLabel="삭제"
            danger
            onClose={() => setRemoving(null)}
            onConfirm={() => {
              setActionError(null);
              const mutation = removing.kind === 'course' ? removeCourse : removeSubject;
              mutation.mutate(removing.id, {
                onSuccess: () => setRemoving(null),
                onError: (caught) => {
                  setActionError(apiErrorMessage(caught, '삭제하지 못했습니다.')); // [75A] SSOT 파싱 수렴
                  setRemoving(null);
                },
              });
            }}
          />
        )}
      </div>
    </AdminGuard>
  );
}
