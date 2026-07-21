'use client';

import { Field } from '@/components/ui';

type ScheduleDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  className?: string;
};

export function ScheduleDateField({ value, onChange, label = '날짜', min, className = 'input' }: ScheduleDateFieldProps) {
  return (
    <Field label={label}>
      <input type="date" className={className} value={value} min={min} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
