'use client';

import { Field } from '@/components/ui';
import type { GuardianFormValue } from './student-form-model';

type GuardianFieldsProps = {
  value: GuardianFormValue;
  onChange: (patch: Partial<GuardianFormValue>) => void;
  onRemove?: () => void;
};

export function GuardianFields({ value, onChange, onRemove }: GuardianFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end border border-line-muted rounded-lg p-3">
      <Field label="보호자 이름 *"><input className="input" value={value.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
      <Field label="관계"><input className="input" value={value.relation} onChange={(event) => onChange({ relation: event.target.value })} placeholder="모 / 부 / 보호자" /></Field>
      <Field label="연락처"><input className="input" value={value.phone} onChange={(event) => onChange({ phone: event.target.value })} /></Field>
      <div className="flex gap-3 pb-1 text-caption text-fg-muted">
        <label className="flex items-center gap-1"><input type="checkbox" checked={value.isPrimary} onChange={(event) => onChange({ isPrimary: event.target.checked })} />주보호자</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={value.isPayer} onChange={(event) => onChange({ isPayer: event.target.checked })} />납부자</label>
      </div>
      {onRemove && <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>보호자 제거</button>}
    </div>
  );
}
