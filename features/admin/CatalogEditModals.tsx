'use client';

import { useState } from 'react';
import { Field, ModalShell } from '@/components/ui';
import { useUpdateCourse, useUpdateSubject } from '@/lib/queries';
import type { Course, Subject } from '@/types';
import { CoursePayFields, type CoursePayForm } from './courses/CoursePayFields';

type InstructorOption = { id: number; name: string; defaultHourlyRate: number; canTeachKinder: boolean };

const messageOf = (caught: unknown, fallback: string): string => {
  const message = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message ?? fallback;
};

export function CourseEditModal({
  course, subjects, instructors, onClose,
}: {
  course: Course;
  subjects: Subject[];
  instructors: InstructorOption[];
  onClose: () => void;
}) {
  const update = useUpdateCourse();
  const [form, setForm] = useState({
    name: course.name,
    subjectId: String(course.subjectId),
    instructorId: String(course.instructorId),
    price: String(course.price),
    color: course.color ?? '',
  });
  const [pay, setPay] = useState<CoursePayForm>({
    hourlyRateOverride: course.hourlyRateOverride == null ? '' : String(course.hourlyRateOverride),
    isKinder: course.isKinder,
  });
  const [error, setError] = useState<string | null>(null);
  const invalid = !form.name.trim() || !form.subjectId || !form.instructorId
    || Number(form.price) < 0 || Number(pay.hourlyRateOverride || 0) < 0
    || (pay.isKinder && !instructors.find((row) => row.id === Number(form.instructorId))?.canTeachKinder);

  const save = () => {
    if (invalid || update.isPending) return;
    setError(null);
    update.mutate({
      id: course.id,
      patch: {
        name: form.name.trim(),
        subjectId: Number(form.subjectId),
        instructorId: Number(form.instructorId),
        price: Number(form.price) || 0,
        hourlyRateOverride: pay.hourlyRateOverride ? Number(pay.hourlyRateOverride) : null,
        isKinder: pay.isKinder,
        color: form.color.trim() || undefined,
      },
    }, {
      onSuccess: onClose,
      onError: (caught) => setError(messageOf(caught, '코스를 수정하지 못했습니다.')),
    });
  };

  return (
    <ModalShell title="코스 수정" size="md" onClose={onClose} footer={(
      <>
        <button className="btn btn-sm" onClick={onClose}>취소</button>
        <button className="btn btn-sm btn-primary" disabled={invalid || update.isPending} onClick={save}>
          {update.isPending ? '저장 중…' : '저장'}
        </button>
      </>
    )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="코스명 *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="과목 *">
          <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Field label="담당 강사 *">
          <select className="input" value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
            {instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
          </select>
        </Field>
        <Field label="정가(원)"><input className="input" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
        <CoursePayFields value={pay} instructor={instructors.find((row) => row.id === Number(form.instructorId))} onChange={setPay} />
        <Field label="색상"><input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#0969da" /></Field>
        {error && <p className="sm:col-span-2 text-caption text-danger" role="alert">{error}</p>}
      </div>
    </ModalShell>
  );
}

export function SubjectEditModal({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const update = useUpdateSubject();
  const [code, setCode] = useState(subject.code);
  const [name, setName] = useState(subject.name);
  const [error, setError] = useState<string | null>(null);
  const invalid = !code.trim() || !name.trim();

  const save = () => {
    if (invalid || update.isPending) return;
    setError(null);
    update.mutate({ id: subject.id, patch: { code: code.trim(), name: name.trim() } }, {
      onSuccess: onClose,
      onError: (caught) => setError(messageOf(caught, '과목을 수정하지 못했습니다.')),
    });
  };

  return (
    <ModalShell title="과목 수정" onClose={onClose} footer={(
      <>
        <button className="btn btn-sm" onClick={onClose}>취소</button>
        <button className="btn btn-sm btn-primary" disabled={invalid || update.isPending} onClick={save}>
          {update.isPending ? '저장 중…' : '저장'}
        </button>
      </>
    )}>
      <div className="space-y-3">
        <Field label="코드 *"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="과목명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {error && <p className="text-caption text-danger" role="alert">{error}</p>}
      </div>
    </ModalShell>
  );
}
