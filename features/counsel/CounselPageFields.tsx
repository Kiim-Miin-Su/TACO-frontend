import { Field } from '@/components/ui';
import type {
  CounselFormSnapshot,
  CounselSource,
  CounselStatus,
  CounselSubmitterType,
} from '@/types';
import { sourceLabel, statusLabel, STATUSES } from './labels';

type Option = { id: number; name: string };

export function CounselPageFields({
  value,
  onChange,
  subjects,
  readOnly = false,
}: {
  value: CounselFormSnapshot;
  onChange?: (next: CounselFormSnapshot) => void;
  subjects: Option[];
  readOnly?: boolean;
}) {
  const set = (patch: Partial<CounselFormSnapshot>) => onChange?.({ ...value, ...patch });
  const disabled = readOnly || !onChange;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="신청자 이름"><input className="input" disabled={disabled} value={value.applicantName} onChange={(e) => set({ applicantName: e.target.value })} /></Field>
      <Field label="연락처"><input className="input" disabled={disabled} value={value.applicantPhone ?? ''} onChange={(e) => set({ applicantPhone: e.target.value || null })} /></Field>
      <Field label="작성 주체">
        <select className="input" disabled={disabled} value={value.submitterType} onChange={(e) => set({ submitterType: e.target.value as CounselSubmitterType })}>
          <option value="parent">학부모</option><option value="student">학생</option><option value="staff">직원</option><option value="unknown">미상</option>
        </select>
      </Field>
      <Field label="상담 상태">
        <select className="input" disabled={disabled} value={value.status} onChange={(e) => set({ status: e.target.value as CounselStatus })}>
          {STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
        </select>
      </Field>
      <Field label="유입 경로">
        <select className="input" disabled={disabled} value={value.source} onChange={(e) => set({ source: e.target.value as CounselSource })}>
          {(Object.keys(sourceLabel) as CounselSource[]).map((source) => <option key={source} value={source}>{sourceLabel[source]}</option>)}
        </select>
      </Field>
      <Field label="다음 상담 예약일"><input type="date" className="input" disabled={disabled} value={value.nextContactAt ?? ''} onChange={(e) => set({ nextContactAt: e.target.value || null })} /></Field>
      <Field label="관심 과목">
        <select className="input" disabled={disabled} value={value.interestSubjectId ?? ''} onChange={(e) => set({ interestSubjectId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">선택 안 함</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="상담 시 참고할 점"><textarea className="input h-24 py-2" disabled={disabled} value={value.referenceNotes ?? ''} onChange={(e) => set({ referenceNotes: e.target.value || null })} /></Field>
      </div>
    </div>
  );
}
