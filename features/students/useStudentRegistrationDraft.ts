'use client';

import { useEffect, useState } from 'react';
import type { CreateStudentAggregateInput } from '@kms545487/contracts';
import {
  emptyStudentProfile,
  guardianInputsOf,
  initialInterests,
  interestInputsOf,
  newClientId,
  studentInputOf,
  validateStudentForm,
  type GuardianFormValue,
  type StudentFormErrors,
} from './student-form-model';

export function useStudentRegistrationDraft(initialCourseId?: number) {
  const [profile, setProfile] = useState(emptyStudentProfile);
  const [interests, setInterests] = useState(initialInterests);
  const [guardians, setGuardians] = useState<GuardianFormValue[]>([]);
  const [courseId, setCourseId] = useState(initialCourseId == null ? '' : String(initialCourseId));
  const [errors, setErrors] = useState<StudentFormErrors>({});

  useEffect(() => {
    if (initialCourseId != null) setCourseId(String(initialCourseId));
  }, [initialCourseId]);

  const updateGuardian = (clientId: string, patch: Partial<GuardianFormValue>) => {
    setGuardians((current) => current.map((guardian) => {
      if (guardian.clientId === clientId) return { ...guardian, ...patch };
      if (patch.isPrimary) return { ...guardian, isPrimary: false };
      return guardian;
    }));
  };

  const addGuardian = () => {
    setGuardians((current) => [...current, {
      clientId: newClientId('guardian'),
      name: '',
      phone: '',
      relation: '보호자',
      isPayer: current.length === 0,
      isPrimary: current.length === 0,
    }]);
  };

  const validate = () => {
    const nextErrors = validateStudentForm(profile, interests, guardians);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const input = (): CreateStudentAggregateInput => ({
    student: studentInputOf(profile),
    interests: interestInputsOf(interests),
    guardians: guardianInputsOf(guardians),
    courseId: courseId ? Number(courseId) : undefined,
  });

  const reset = () => {
    setProfile(emptyStudentProfile());
    setInterests(initialInterests());
    setGuardians([]);
    setCourseId(initialCourseId == null ? '' : String(initialCourseId));
    setErrors({});
  };

  return {
    profile,
    setProfile,
    interests,
    setInterests,
    guardians,
    setGuardians,
    courseId,
    setCourseId,
    errors,
    setErrors,
    updateGuardian,
    addGuardian,
    validate,
    input,
    reset,
  };
}
