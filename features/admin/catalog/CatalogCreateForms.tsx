'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Course, Subject } from '@/types';
import { Field } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import { useCreateCourse, useCreateSubject, useInstructorAdminList, useSubjects } from '@/lib/queries';
import { CoursePayFields, type CoursePayForm } from '../courses/CoursePayFields';

const COURSE_PALETTE = ['#0969da', '#1a7f37', '#8250df', '#bf3989', '#9a6700', '#1b7c83'];

export function CourseCreateForm({
  compact = false,
  initialSubjectId,
  initialInstructorId,
  submitLabel = '코스 추가',
  onCreated,
}: {
  compact?: boolean;
  initialSubjectId?: number;
  initialInstructorId?: number | null;
  submitLabel?: string;
  onCreated?: (course: Course) => void;
}) {
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructorAdminList();
  const addCourse = useCreateCourse();
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState(initialSubjectId ? String(initialSubjectId) : '');
  const [instructorId, setInstructorId] = useState(initialInstructorId === null ? 'unassigned' : initialInstructorId ? String(initialInstructorId) : '');
  const [price, setPrice] = useState('');
  const [pay, setPay] = useState<CoursePayForm>({ hourlyRateOverride: '', isKinder: false });
  const [color, setColor] = useState<string>(COURSE_PALETTE[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (initialSubjectId != null) setSubjectId(String(initialSubjectId));
  }, [initialSubjectId]);
  useEffect(() => {
    if (initialInstructorId !== undefined) setInstructorId(initialInstructorId === null ? 'unassigned' : String(initialInstructorId));
  }, [initialInstructorId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess('');
    if (!name.trim()) { setFormError('코스명을 입력해 주세요.'); return; }
    if (!subjectId) { setFormError('과목을 선택해 주세요.'); return; }
    if (!instructorId) { setFormError('담당 강사 또는 배정중을 선택해 주세요.'); return; }
    addCourse.mutate({
      name: name.trim(),
      subjectId: Number(subjectId),
      instructorId: instructorId === 'unassigned' ? null : Number(instructorId),
      price: Number(price) || 0,
      hourlyRateOverride: pay.hourlyRateOverride ? Number(pay.hourlyRateOverride) : null,
      isKinder: pay.isKinder,
      color,
    }, {
      onSuccess: (created) => {
        setName('');
        setPrice('');
        setPay({ hourlyRateOverride: '', isKinder: false });
        setColor(COURSE_PALETTE[0]);
        setSuccess(`${created.name} 코스를 등록했습니다.`);
        onCreated?.(created);
      },
      onError: (caught) => setFormError(apiErrorMessage(caught, '코스를 추가하지 못했습니다. 다시 시도해 주세요.')),
    });
  };

  return (
    <form onSubmit={submit} className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${compact ? '' : 'p-4'}`}>
      <Field label="코스명 *"><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="SAT Reading 정규" /></Field>
      <Field label="정가(원)"><input className="input" type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="480000" /></Field>
      <CoursePayFields value={pay} instructor={instructors.find((row) => row.id === Number(instructorId))} onChange={setPay} />
      <Field label="과목 *">
        <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">선택</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </Field>
      <Field label="담당 강사 *">
        <select className="input" value={instructorId} onChange={(event) => setInstructorId(event.target.value)}>
          <option value="">선택</option>
          <option value="unassigned">배정중</option>
          {instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
        </select>
      </Field>
      <Field label="캘린더 색상 라벨">
        <div className="flex items-center gap-1.5 h-9">
          {COURSE_PALETTE.map((candidate) => (
            <button key={candidate} type="button" onClick={() => setColor(candidate)} aria-label={candidate}
              className="w-6 h-6 rounded-full"
              style={{ background: candidate, outline: color === candidate ? '2px solid var(--color-fg)' : '1px solid var(--color-line)', outlineOffset: 1 }} />
          ))}
        </div>
      </Field>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3">
        {formError && <span className="text-caption text-danger" role="alert">{formError}</span>}
        {success && <span className="text-caption text-success" role="status">{success}</span>}
        <button type="submit" className="btn btn-primary" disabled={addCourse.isPending}>{addCourse.isPending ? '추가 중…' : submitLabel}</button>
      </div>
    </form>
  );
}

export function SubjectCreateForm({
  compact = false,
  onCreated,
}: {
  compact?: boolean;
  onCreated?: (subject: Subject) => void;
}) {
  const addSubject = useCreateSubject();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess('');
    if (!code.trim()) { setFormError('과목 코드를 입력해 주세요.'); return; }
    if (!name.trim()) { setFormError('과목명을 입력해 주세요.'); return; }
    addSubject.mutate({ code: code.trim(), name: name.trim() }, {
      onSuccess: (created) => {
        setCode('');
        setName('');
        setSuccess(`${created.name} 과목을 등록했습니다.`);
        onCreated?.(created);
      },
      onError: (caught) => setFormError(apiErrorMessage(caught, '과목을 추가하지 못했습니다. 다시 시도해 주세요.')),
    });
  };
  return (
    <form onSubmit={submit} className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${compact ? '' : 'p-4'}`}>
      <Field label="코드 *"><input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="science" /></Field>
      <Field label="과목명 *"><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="과학" /></Field>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3">
        {formError && <span className="text-caption text-danger" role="alert">{formError}</span>}
        {success && <span className="text-caption text-success" role="status">{success}</span>}
        <button type="submit" className="btn btn-primary" disabled={addSubject.isPending}>{addSubject.isPending ? '추가 중…' : '과목 추가'}</button>
      </div>
    </form>
  );
}
