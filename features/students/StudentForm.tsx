'use client';

import { useState } from 'react';
import { Field } from '@/components/ui';
import { useCourses, useRegisterStudent } from '@/lib/queries';
import { GuardianFields } from './GuardianFields';
import { StudentInterestsFields } from './StudentInterestsFields';
import { StudentProfileFields } from './StudentProfileFields';
import {
  emptyStudentProfile,
  guardianInputsOf,
  initialInterests,
  interestInputsOf,
  newClientId,
  serverStudentErrors,
  studentInputOf,
  validateStudentForm,
  type GuardianFormValue,
  type StudentFormErrors,
} from './student-form-model';

export function StudentForm() {
  const register = useRegisterStudent();
  const { data: courses = [] } = useCourses();
  const [profile, setProfile] = useState(emptyStudentProfile);
  const [interests, setInterests] = useState(initialInterests);
  const [guardians, setGuardians] = useState<GuardianFormValue[]>([]);
  const [courseId, setCourseId] = useState('');
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [message, setMessage] = useState('');

  const updateGuardian = (clientId: string, patch: Partial<GuardianFormValue>) => {
    setGuardians((current) => current.map((guardian) => {
      if (guardian.clientId === clientId) return { ...guardian, ...patch };
      if (patch.isPrimary) return { ...guardian, isPrimary: false };
      return guardian;
    }));
  };

  const addGuardian = () => {
    setGuardians((current) => [...current, {
      clientId: newClientId('guardian'), name: '', phone: '', relation: '보호자',
      isPayer: current.length === 0, isPrimary: current.length === 0,
    }]);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateStudentForm(profile, interests, guardians);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length || register.isPending) return;
    register.mutate({
      student: studentInputOf(profile),
      interests: interestInputsOf(interests),
      guardians: guardianInputsOf(guardians),
      courseId: courseId ? Number(courseId) : undefined,
    }, {
      onSuccess: (result) => {
        setProfile(emptyStudentProfile());
        setInterests(initialInterests());
        setGuardians([]);
        setCourseId('');
        setErrors({});
        const linked = result.guardians?.filter((guardian) => guardian.linkedExisting).length ?? 0;
        setMessage(linked ? `등록 완료 — 기존 보호자 ${linked}명과 안전하게 연결했습니다.` : '등록 완료');
      },
      onError: (error) => {
        const parsed = serverStudentErrors(error);
        setErrors((current) => ({ ...current, ...parsed.fields }));
        setMessage(parsed.message);
      },
    });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-6">
      <FormGroup title="학생 정보">
        <StudentProfileFields value={profile} onChange={(patch) => setProfile((current) => ({ ...current, ...patch }))} errors={errors} />
      </FormGroup>

      <FormGroup title="관심 희망 수업 (2개 이상 · 실제 수강 등록과 별도)">
        <StudentInterestsFields value={interests} courses={courses} onChange={setInterests} error={errors.interests} />
      </FormGroup>

      <FormGroup title="보호자 (선택 · 학생과 함께 원자 저장)">
        <div className="space-y-3">
          {guardians.map((guardian) => (
            <GuardianFields
              key={guardian.clientId}
              value={guardian}
              onChange={(patch) => updateGuardian(guardian.clientId, patch)}
              onRemove={() => setGuardians((current) => current.filter((item) => item.clientId !== guardian.clientId))}
            />
          ))}
          <button type="button" className="btn btn-sm" onClick={addGuardian} disabled={guardians.length >= 10}>+ 보호자 추가</button>
          {errors.guardians && <p className="text-caption text-danger" role="alert">{errors.guardians}</p>}
        </div>
      </FormGroup>

      <FormGroup title="즉시 수강 등록 (선택 · 희망 수업과 별도)">
        <div className="max-w-md"><Field label="실제 수강 코스">
          <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">등록하지 않음</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </Field></div>
      </FormGroup>

      <div className="flex items-center justify-end gap-3">
        {message && <span className={`text-caption ${Object.keys(errors).length ? 'text-danger' : 'text-success'}`} role="status">{message}</span>}
        <button type="submit" className="btn btn-primary" disabled={register.isPending}>{register.isPending ? 'DB 검증·등록 중…' : '학생 등록'}</button>
      </div>
    </form>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="text-caption font-semibold text-fg-muted mb-2">{title}</h3>{children}</section>;
}
