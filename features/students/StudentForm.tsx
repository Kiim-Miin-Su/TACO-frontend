'use client';

import { useState } from 'react';
import { useCourses, useRegisterStudent } from '@/lib/queries';
import { StudentRegistrationFields } from './StudentRegistrationFields';
import { serverStudentErrors } from './student-form-model';
import { useStudentRegistrationDraft } from './useStudentRegistrationDraft';

export function StudentForm() {
  const register = useRegisterStudent();
  const { data: courses = [] } = useCourses();
  const draft = useStudentRegistrationDraft();
  const [message, setMessage] = useState('');

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    if (!draft.validate() || register.isPending) return;
    register.mutate(draft.input(), {
      onSuccess: (result) => {
        draft.reset();
        const linked = result.guardians?.filter((guardian) => guardian.linkedExisting).length ?? 0;
        setMessage(linked ? `등록 완료 — 기존 보호자 ${linked}명과 안전하게 연결했습니다.` : '등록 완료');
      },
      onError: (error) => {
        const parsed = serverStudentErrors(error);
        draft.setErrors((current) => ({ ...current, ...parsed.fields }));
        setMessage(parsed.message);
      },
    });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-6">
      <StudentRegistrationFields draft={draft} courses={courses} />

      <div className="flex items-center justify-end gap-3">
        {message && <span className={`text-caption ${Object.keys(draft.errors).length ? 'text-danger' : 'text-success'}`} role="status">{message}</span>}
        <button type="submit" className="btn btn-primary" disabled={register.isPending}>{register.isPending ? 'DB 검증·등록 중…' : '학생 등록'}</button>
      </div>
    </form>
  );
}
