'use client';

import { useState } from 'react';
import { ModalShell } from '@/components/ui';
import { useCourses, useUpdateStudentAggregate } from '@/lib/queries';
import type { StudentAggregate } from '@/types';
import { StudentInterestsFields } from './StudentInterestsFields';
import { StudentProfileFields } from './StudentProfileFields';
import {
  interestFormsOf,
  interestInputsOf,
  serverStudentErrors,
  studentInputOf,
  studentProfileOf,
  validateStudentForm,
  type StudentFormErrors,
} from './student-form-model';

type StudentProfileEditModalProps = {
  aggregate: StudentAggregate;
  onClose: () => void;
};

export function StudentProfileEditModal({ aggregate, onClose }: StudentProfileEditModalProps) {
  const update = useUpdateStudentAggregate();
  const { data: courses = [] } = useCourses();
  const [profile, setProfile] = useState(() => studentProfileOf(aggregate.student));
  const [interests, setInterests] = useState(() => interestFormsOf(aggregate.interests));
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [message, setMessage] = useState('');

  const save = () => {
    const nextErrors = validateStudentForm(profile, interests);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length || update.isPending) return;
    update.mutate({
      id: aggregate.student.id,
      patch: { student: studentInputOf(profile), interests: interestInputsOf(interests) },
    }, {
      onSuccess: onClose,
      onError: (error) => {
        const parsed = serverStudentErrors(error);
        setErrors((current) => ({ ...current, ...parsed.fields }));
        setMessage(parsed.message);
      },
    });
  };

  return (
    <ModalShell title="학생 정보 · 희망 수업 수정" size="lg" onClose={onClose} bodyClassName="space-y-6" footer={(
      <>
        <button className="btn btn-sm" onClick={onClose}>취소</button>
        <button className="btn btn-sm btn-primary" disabled={update.isPending} onClick={save}>{update.isPending ? '저장 중…' : '저장'}</button>
      </>
    )}>
      <section>
        <h3 className="text-caption font-semibold text-fg-muted mb-2">학생 정보</h3>
        <StudentProfileFields value={profile} onChange={(patch) => setProfile((current) => ({ ...current, ...patch }))} errors={errors} />
      </section>
      <section>
        <h3 className="text-caption font-semibold text-fg-muted mb-2">관심 희망 수업 (2개 이상)</h3>
        <StudentInterestsFields value={interests} courses={courses} onChange={setInterests} error={errors.interests} />
      </section>
      {message && <p className="text-caption text-danger" role="alert">{message}</p>}
    </ModalShell>
  );
}
