'use client';

import { Field, FieldError } from '@/components/ui';
import { STUDENT_GRADE_OPTIONS } from '@/lib/domain/students';

type StudentGradeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  compact?: boolean;
};

export function StudentGradeField({ value, onChange, error, compact = false }: StudentGradeFieldProps) {
  const select = (
    <select
      className={`input w-full ${compact ? 'h-7 text-caption' : ''}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={!!error}
    >
      <option value="">선택</option>
      {STUDENT_GRADE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
  if (compact) return <label className="block"><span className="text-micro text-fg-muted">학년</span>{select}{error && <FieldError>{error}</FieldError>}</label>;
  return <Field label="학년 *" error={error}>{select}</Field>;
}
