'use client';

import { useState, type FormEvent } from 'react';
import type { RegistrationResult } from '@/types';
import { useCourses, useRegisterStudent } from '@/lib/queries';
import { StudentRegistrationFields } from './StudentRegistrationFields';
import { serverStudentErrors } from './student-form-model';
import { useStudentRegistrationDraft } from './useStudentRegistrationDraft';

export function StudentRegistrationForm({
  compact = false,
  initialCourseId,
  onCreated,
}: {
  compact?: boolean;
  initialCourseId?: number;
  onCreated?: (result: RegistrationResult) => void;
}) {
  const register = useRegisterStudent();
  const { data: courses = [] } = useCourses();
  const draft = useStudentRegistrationDraft(initialCourseId);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setFailed(false);
    if (!draft.validate() || register.isPending) return;
    register.mutate(draft.input(), {
      onSuccess: (result) => {
        draft.reset();
        const linked = result.guardians?.filter((guardian) => guardian.linkedExisting).length ?? 0;
        setMessage(linked ? `등록 완료 — 기존 보호자 ${linked}명과 안전하게 연결했습니다.` : `${result.student.name} 학생을 등록했습니다.`);
        onCreated?.(result);
      },
      onError: (error) => {
        const parsed = serverStudentErrors(error);
        draft.setErrors((current) => ({ ...current, ...parsed.fields }));
        setMessage(parsed.message);
        setFailed(true);
      },
    });
  };

  return (
    <form onSubmit={submit} className={`space-y-6 ${compact ? '' : 'p-4'}`}>
      <StudentRegistrationFields draft={draft} courses={courses} showStatus={!compact} showOptionalSections={!compact} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && <span className={`text-caption ${failed ? 'text-danger' : 'text-success'}`} role={failed ? 'alert' : 'status'}>{message}</span>}
        <button type="submit" className="btn btn-primary" disabled={register.isPending}>{register.isPending ? 'DB 검증·등록 중…' : '학생 등록'}</button>
      </div>
    </form>
  );
}
