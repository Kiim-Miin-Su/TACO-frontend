'use client';

import { Field } from '@/components/ui';

type ScheduleDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  className?: string;
  field?: string;
  error?: string;
};

export function ScheduleDateField({ value, onChange, label = '날짜', min, className = 'input', field, error }: ScheduleDateFieldProps) {
  return (
    <Field label={label} field={field} error={error}>
      <input type="date" className={className} value={value} min={min} aria-invalid={!!error || undefined} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
