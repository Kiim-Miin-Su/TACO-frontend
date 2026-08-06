'use client';

import { useState, type FormEvent } from 'react';
import type { RegistrationResult } from '@/types';
import { useCourses, useRegisterStudent, useStudents } from '@/lib/queries';
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
  // [TBO-86I-4] "기존에 다니는 가족" 연결 선택지 — 활성 재원생 목록(단일 학생 캐시 재사용).
  const { data: students = [] } = useStudents();
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
    // [TBO-86I-4] compact는 여백 스타일만 — 입력 필드 집합은 표준 등록 화면과 항상 동일(input≡DTO).
    <form onSubmit={submit} className={`space-y-6 ${compact ? '' : 'p-4'}`}>
      <StudentRegistrationFields draft={draft} courses={courses} students={students} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && <span className={`text-caption ${failed ? 'text-danger' : 'text-success'}`} role={failed ? 'alert' : 'status'}>{message}</span>}
        <button type="submit" className="btn btn-primary" disabled={register.isPending}>{register.isPending ? 'DB 검증·등록 중…' : '학생 등록'}</button>
      </div>
    </form>
  );
}
