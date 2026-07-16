// [참조/처리] 관리자 코스/과목 카탈로그. 읽기=TanStack Query(useCourses·useSubjects·useInstructors),
//  쓰기=api.courses/subjects.create → 성공 시 해당 queryKey invalidate로 목록 자동 갱신(단일 소스).
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SectionCard, EmptyState, LoadingState, TableWrap } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useCourses, useSubjects, useInstructors } from '@/lib/queries';
import { won } from '@/lib/format';
import { AdminGuard, AdminHeader } from './AdminShell';
import { Field } from '@/components/ui';
// [B4 2026-07-16 대표 결정 ②] 강의실 관리 — 수업 추가 모달과 같은 공용 컴포넌트 재사용(사설 사본 금지)
import { RoomManagerPanel } from '@/features/rooms/RoomManagerPanel';

export function CoursesView() {
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [], isPending: loading } = useCourses(); // [E0.6 H2]
  const { data: instructors = [] } = useInstructors();
  const subjectName = (id: number) => subjects.find((x) => x.id === id)?.name ?? '—';
  const instructorName = (id: number) => instructors.find((x) => x.id === id)?.name ?? '—';

  return (
    <AdminGuard>
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        <div className="grid lg:grid-cols-2 gap-6">
          <SectionCard title="코스 추가"><CourseForm /></SectionCard>
          <SectionCard title="과목 추가"><SubjectForm /></SectionCard>
        </div>
        <SectionCard title={`코스 목록 (${courses.length})`}>
          {loading ? (
            <LoadingState />
          ) : courses.length === 0 ? (
            <EmptyState message="등록된 코스가 없습니다. 위에서 코스를 추가하세요." />
          ) : (
          <TableWrap>
          <table className="table">
            <thead><tr><th>코스</th><th>과목</th><th>강사</th><th className="text-right">정가</th></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">
                    {c.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: c.color }} />}
                    {/* [TBO-20 20-C] 코스명 클릭 → 코스 상세(수강생·세션·로드맵) */}
                    <Link href={`/admin/courses/${c.id}`} className="text-accent hover:underline">{c.name}</Link>
                  </td>
                  <td className="text-fg-muted">{subjectName(c.subjectId)}</td>
                  <td className="text-fg-muted">{instructorName(c.instructorId)}</td>
                  <td className="text-right mono">{won(c.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
          )}
        </SectionCard>
        <SectionCard title="강의실 관리 (매니저 이상)"><RoomManagerPanel /></SectionCard>
      </div>
    </AdminGuard>
  );
}

const COURSE_PALETTE = ['#0969da', '#1a7f37', '#8250df', '#bf3989', '#9a6700', '#1b7c83'];

function CourseForm() {
  const qc = useQueryClient();
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructors();
  const addCourse = useMutation({
    mutationFn: api.courses.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.courses.all }),
  });
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [price, setPrice] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [color, setColor] = useState<string>(COURSE_PALETTE[0]);
  // [E0.6 M 2026-07-16] 종전엔 필수 미입력 시 조용히 return, 서버 실패도 무통보 — 인라인 검증+실패 표시.
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError('코스명을 입력해 주세요.'); return; }
    if (!subjectId) { setFormError('과목을 선택해 주세요.'); return; }
    if (!instructorId) { setFormError('담당 강사를 선택해 주세요.'); return; }
    addCourse.mutate(
      {
        name: name.trim(), subjectId: Number(subjectId), instructorId: Number(instructorId),
        price: Number(price) || 0, hourlyRate: Number(hourlyRate) || 0, color,
      },
      {
        onSuccess: () => { setName(''); setSubjectId(''); setInstructorId(''); setPrice(''); setHourlyRate(''); setColor(COURSE_PALETTE[0]); },
        onError: (caught) => {
          const msg = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
          setFormError(Array.isArray(msg) ? msg.join(' ') : msg ?? '코스를 추가하지 못했습니다. 다시 시도해 주세요.');
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코스명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SAT Reading 정규" /></Field>
      <Field label="정가(원)"><input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="480000" /></Field>
      <Field label="강사 시급(원/시간)"><input className="input" type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="50000" /></Field>
      <Field label="과목 *">
        <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">선택</option>
          {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </Field>
      <Field label="담당 강사 *">
        <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          <option value="">선택</option>
          {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
      </Field>
      <Field label="캘린더 색상 라벨">
        <div className="flex items-center gap-1.5 h-9">
          {COURSE_PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
              className="w-6 h-6 rounded-full"
              style={{ background: c, outline: color === c ? '2px solid var(--color-fg)' : '1px solid var(--color-line)', outlineOffset: 1 }} />
          ))}
        </div>
      </Field>
      <div className="sm:col-span-2 flex items-center justify-end gap-3">
        {formError && <span className="text-caption text-danger" role="alert">{formError}</span>}
        <button type="submit" className="btn btn-primary" disabled={addCourse.isPending}>{addCourse.isPending ? '추가 중…' : '코스 추가'}</button>
      </div>
    </form>
  );
}

function SubjectForm() {
  const qc = useQueryClient();
  const addSubject = useMutation({
    mutationFn: api.subjects.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subjects.all }),
  });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // [E0.6 M 2026-07-16] CourseForm과 동일 규약 — 인라인 검증+onError+제출 중 비활성.
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!code.trim()) { setFormError('과목 코드를 입력해 주세요.'); return; }
    if (!name.trim()) { setFormError('과목명을 입력해 주세요.'); return; }
    addSubject.mutate({ code: code.trim(), name: name.trim() }, {
      onSuccess: () => { setCode(''); setName(''); },
      onError: (caught) => {
        const msg = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
        setFormError(Array.isArray(msg) ? msg.join(' ') : msg ?? '과목을 추가하지 못했습니다. 다시 시도해 주세요.');
      },
    });
  };
  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코드 *"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="science" /></Field>
      <Field label="과목명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="과학" /></Field>
      <div className="sm:col-span-2 flex items-center justify-end gap-3">
        {formError && <span className="text-caption text-danger" role="alert">{formError}</span>}
        <button type="submit" className="btn btn-primary" disabled={addSubject.isPending}>{addSubject.isPending ? '추가 중…' : '과목 추가'}</button>
      </div>
    </form>
  );
}
