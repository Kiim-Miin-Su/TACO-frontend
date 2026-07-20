'use client';

import { useState } from 'react';
import { Field, ModalShell } from '@/components/ui';
import { useUpdateStudent } from '@/lib/queries';
import { STUDENT_STATUS_LABEL } from '@/lib/domain/students';
import type { Student, StudentStatus } from '@/types';

const STATUSES = Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[];

export function StudentProfileEditModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const update = useUpdateStudent();
  const [form, setForm] = useState({
    name: student.name,
    englishName: student.englishName ?? '',
    grade: student.grade == null ? '' : String(student.grade),
    phone: student.phone ?? '',
    country: (student.country ?? 'KR').toUpperCase(),
    residenceType: student.residenceType ?? 'domestic',
    status: student.status,
    memo: student.memo ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const invalid = !form.name.trim() || !/^[A-Z]{2}$/.test(form.country)
    || (!!form.grade && (Number(form.grade) < 1 || Number(form.grade) > 12));

  const save = () => {
    if (invalid || update.isPending) return;
    setError(null);
    update.mutate({
      id: student.id,
      patch: {
        name: form.name.trim(),
        englishName: form.englishName.trim() || undefined,
        grade: form.grade ? Number(form.grade) : undefined,
        phone: form.phone.trim() || undefined,
        country: form.country,
        residenceType: form.residenceType as Student['residenceType'],
        status: form.status,
        memo: form.memo.trim() || undefined,
      },
    }, {
      onSuccess: onClose,
      onError: (caught) => {
        const message = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
        setError(Array.isArray(message) ? message.join(' ') : message ?? '학생 정보를 수정하지 못했습니다.');
      },
    });
  };

  return (
    <ModalShell title="학생 정보 수정" size="md" onClose={onClose} footer={(
      <>
        <button className="btn btn-sm" onClick={onClose}>취소</button>
        <button className="btn btn-sm btn-primary" disabled={invalid || update.isPending} onClick={save}>
          {update.isPending ? '저장 중…' : '저장'}
        </button>
      </>
    )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="이름 *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="영문명"><input className="input" value={form.englishName} onChange={(e) => setForm({ ...form, englishName: e.target.value })} /></Field>
        <Field label="학년"><input className="input" type="number" min={1} max={12} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></Field>
        <Field label="연락처"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="국가 코드"><input className="input uppercase" maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} /></Field>
        <Field label="거주">
          <select className="input" value={form.residenceType} onChange={(e) => setForm({ ...form, residenceType: e.target.value as NonNullable<Student['residenceType']> })}>
            <option value="domestic">국내</option><option value="overseas">해외</option>
          </select>
        </Field>
        <Field label="상태">
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
            {STATUSES.map((status) => <option key={status} value={status}>{STUDENT_STATUS_LABEL[status]}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="메모"><textarea className="input h-20 py-2" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></Field></div>
        {error && <p className="sm:col-span-2 text-caption text-danger" role="alert">{error}</p>}
      </div>
    </ModalShell>
  );
}
