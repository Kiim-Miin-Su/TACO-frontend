import { Field } from '@/components/ui';
import type {
  CounselFormSnapshot,
  CounselStatus,
} from '@/types';
import { statusLabel, STATUSES } from './labels';
import { CounselContentField, CounselNextContactField } from './CounselSharedFields';

export function CounselPageFields({
  value,
  onChange,
  readOnly = false,
}: {
  value: CounselFormSnapshot;
  onChange?: (next: CounselFormSnapshot) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<CounselFormSnapshot>) => onChange?.({ ...value, ...patch });
  const disabled = readOnly || !onChange;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="상담 상태">
        <select className="input" disabled={disabled} value={value.status} onChange={(e) => set({ status: e.target.value as CounselStatus })}>
          {STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <CounselNextContactField value={value.nextContactAt} onChange={(nextContactAt) => set({ nextContactAt })} disabled={disabled} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <CounselContentField
          value={value.referenceNotes ?? ''}
          onChange={(referenceNotes) => set({ referenceNotes: referenceNotes || null })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
