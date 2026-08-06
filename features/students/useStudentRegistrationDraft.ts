'use client';

import { useEffect, useState } from 'react';
import type { CreateStudentAggregateInput } from '@kms545487/contracts';
import {
  emptyStudentProfile,
  familyRelationInputsOf,
  guardianInputsOf,
  initialInterests,
  interestInputsOf,
  newClientId,
  studentInputOf,
  validateStudentForm,
  type FamilyRelationFormValue,
  type GuardianFormValue,
  type StudentFormErrors,
} from './student-form-model';

export function useStudentRegistrationDraft(initialCourseId?: number) {
  const [profile, setProfile] = useState(emptyStudentProfile);
  const [interests, setInterests] = useState(initialInterests);
  const [guardians, setGuardians] = useState<GuardianFormValue[]>([]);
  // [TBO-86I-4] "기존에 다니는 가족" 연결 행 — 등록 command와 같은 tx로 전송된다.
  const [familyRelations, setFamilyRelations] = useState<FamilyRelationFormValue[]>([]);
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

  const addFamilyRelation = () => {
    setFamilyRelations((current) => [...current, {
      clientId: newClientId('family'),
      relatedStudentId: '',
      relationType: 'sibling',
      relationLabel: '',
      linkGuardians: true,
    }]);
  };

  const updateFamilyRelation = (clientId: string, patch: Partial<FamilyRelationFormValue>) => {
    setFamilyRelations((current) => current.map((relation) =>
      relation.clientId === clientId ? { ...relation, ...patch } : relation));
  };

  const removeFamilyRelation = (clientId: string) => {
    setFamilyRelations((current) => current.filter((relation) => relation.clientId !== clientId));
  };

  const validate = () => {
    const nextErrors = validateStudentForm(profile, interests, guardians, familyRelations);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const input = (): CreateStudentAggregateInput => ({
    student: studentInputOf(profile),
    interests: interestInputsOf(interests),
    guardians: guardianInputsOf(guardians),
    courseId: courseId ? Number(courseId) : undefined,
    familyRelations: familyRelationInputsOf(familyRelations),
  });

  const reset = () => {
    setProfile(emptyStudentProfile());
    setInterests(initialInterests());
    setGuardians([]);
    setFamilyRelations([]);
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
    familyRelations,
    addFamilyRelation,
    updateFamilyRelation,
    removeFamilyRelation,
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
