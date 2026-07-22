'use client';

import { useMemo, useState } from 'react';
import { Field } from '@/components/ui';
import type { Student } from '@/types';

type StudentSearchSelectProps = {
  students: readonly Student[];
  value: number | null;
  onChange: (studentId: number | null) => void;
  excludeIds?: ReadonlySet<number>;
  autoFocus?: boolean;
  required?: boolean;
};

/** 상담·가족 연결이 공유하는 학생 원부 검색기. 선택값은 student id만 상위 폼에 전달한다. */
export function StudentSearchSelect({
  students,
  value,
  onChange,
  excludeIds,
  autoFocus = false,
  required = false,
}: StudentSearchSelectProps) {
  const [search, setSearch] = useState('');
  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => !excludeIds?.has(student.id)
      && (!needle || `${student.name} ${student.schoolName ?? ''} ${student.phone ?? ''}`.toLowerCase().includes(needle)));
  }, [excludeIds, search, students]);

  return (
    <div className="space-y-3">
      <Field label="학생 검색">
        <input
          className="input"
          autoFocus={autoFocus}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="이름·학교·연락처"
        />
      </Field>
      <Field label={`검색 결과${required ? ' *' : ''}`}>
        <select
          className="input h-44 min-h-44 py-2 text-body"
          size={Math.min(7, Math.max(5, candidates.length))}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          required={required}
        >
          {!candidates.length && <option value="">검색 결과 없음</option>}
          {candidates.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name} · {student.schoolName ?? '학교 미입력'} · {student.phone ?? '연락처 없음'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption text-fg-subtle">
          {value == null ? '검색 결과에서 학생을 선택하세요.' : '학생이 선택되었습니다. 변경하려면 다른 행을 선택하세요.'}
        </p>
      </Field>
    </div>
  );
}
