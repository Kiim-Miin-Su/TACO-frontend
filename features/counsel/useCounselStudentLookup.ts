'use client';

import { useMemo } from 'react';
import { useStudents } from '@/lib/queries';

/** 상담 목록·캘린더가 학생 이름/연락처를 students SSOT에서 동일하게 파생한다. */
export function useCounselStudentLookup() {
  const query = useStudents();
  const studentById = useMemo(
    () => new Map((query.data ?? []).map((student) => [student.id, student])),
    [query.data],
  );
  return { ...query, studentById };
}

