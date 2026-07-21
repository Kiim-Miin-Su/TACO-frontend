'use client';

import { Field } from '@/components/ui';

export type InstructorProfileForm = {
  name: string;
  email: string;
  phone: string;
  university: string;
  major: string;
  birthYear: string;
  countryCode: string;
  timeZone: string;
  defaultHourlyRate: string;
  canTeachKinder: boolean;
};

export const emptyInstructorProfileForm = (): InstructorProfileForm => ({
  name: '', email: '', phone: '', university: '', major: '', birthYear: '',
  countryCode: 'KR', timeZone: 'Asia/Seoul', defaultHourlyRate: '0', canTeachKinder: false,
});

export function InstructorProfileFields({
  value,
  onChange,
  disabled = false,
}: {
  value: InstructorProfileForm;
  onChange: (next: InstructorProfileForm) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof InstructorProfileForm, next: string | boolean) => onChange({ ...value, [key]: next });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="이름"><input className="input w-full" value={value.name} onChange={(e) => set('name', e.target.value)} disabled={disabled} required maxLength={50} /></Field>
      <Field label="기본 시급(원/시간)"><input className="input w-full" type="number" min={0} max={100000000} value={value.defaultHourlyRate} onChange={(e) => set('defaultHourlyRate', e.target.value)} disabled={disabled} required /></Field>
      <Field label="이메일"><input className="input w-full" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} disabled={disabled} maxLength={320} /></Field>
      <Field label="연락처"><input className="input w-full" type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} disabled={disabled} maxLength={20} /></Field>
      <Field label="대학교"><input className="input w-full" value={value.university} onChange={(e) => set('university', e.target.value)} disabled={disabled} maxLength={100} /></Field>
      <Field label="전공"><input className="input w-full" value={value.major} onChange={(e) => set('major', e.target.value)} disabled={disabled} maxLength={100} /></Field>
      <Field label="출생연도"><input className="input w-full" type="number" min={1940} max={2020} value={value.birthYear} onChange={(e) => set('birthYear', e.target.value)} disabled={disabled} placeholder="1995" /></Field>
      <Field label="근무 국가 코드"><input className="input w-full" value={value.countryCode} onChange={(e) => set('countryCode', e.target.value.toUpperCase())} disabled={disabled} maxLength={8} placeholder="KR" /></Field>
      <Field label="시간대"><input className="input w-full" value={value.timeZone} onChange={(e) => set('timeZone', e.target.value)} disabled={disabled} maxLength={64} placeholder="Asia/Seoul" /></Field>
      <Field label="Kinder 수업 가능">
        <label className="h-10 flex items-center gap-2">
          <input type="checkbox" checked={value.canTeachKinder} onChange={(e) => set('canTeachKinder', e.target.checked)} disabled={disabled} />
          <span className="text-body">3~7세 수업 배정 가능</span>
        </label>
      </Field>
    </div>
  );
}
