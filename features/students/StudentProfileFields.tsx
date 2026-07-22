'use client';

import { Field } from '@/components/ui';
import { COUNTRIES } from '@/lib/domain/tz';
import { STUDENT_STATUS_LABEL } from '@/lib/domain/students';
import type { StudentStatus } from '@/types';
import type { StudentFormErrors, StudentProfileFormValue } from './student-form-model';
import { StudentGradeField } from './StudentGradeField';

const STATUSES = Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[];
const STUDENT_COUNTRIES = COUNTRIES.filter((country) => /^[A-Z]{2}$/.test(country.code));

type StudentProfileFieldsProps = {
  value: StudentProfileFormValue;
  onChange: (patch: Partial<StudentProfileFormValue>) => void;
  errors?: StudentFormErrors;
  showStatus?: boolean;
};

export function StudentProfileFields({ value, onChange, errors = {}, showStatus = true }: StudentProfileFieldsProps) {
  const input = (field: keyof StudentProfileFormValue) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange({ [field]: event.target.value });
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="학생 이름 *" error={errors.name}><input className="input" value={value.name} onChange={input('name')} aria-invalid={!!errors.name} /></Field>
      <Field label="영문명"><input className="input" value={value.englishName} onChange={input('englishName')} /></Field>
      <Field label="성별 *" error={errors.gender}>
        <select className="input" value={value.gender} onChange={(event) => onChange({ gender: event.target.value as StudentProfileFormValue['gender'] })} aria-invalid={!!errors.gender}>
          <option value="">선택</option><option value="male">남성</option><option value="female">여성</option><option value="other">기타</option><option value="undisclosed">미공개</option>
        </select>
      </Field>
      <Field label="생년월일 *" error={errors.birthDate}><input className="input" type="date" value={value.birthDate} onChange={input('birthDate')} aria-invalid={!!errors.birthDate} /></Field>
      <StudentGradeField value={value.grade} onChange={(grade) => onChange({ grade })} error={errors.grade} />
      <Field label="거주 국가 *" error={errors.country}>
        <select className="input" value={value.country} onChange={(event) => onChange({ country: event.target.value })} aria-invalid={!!errors.country}>
          {STUDENT_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
        </select>
      </Field>
      <Field label="현 거주지 *" error={errors.address}><input className="input" value={value.address} onChange={input('address')} aria-invalid={!!errors.address} placeholder="도시·구·도로명" /></Field>
      <Field label="상세 주소"><input className="input" value={value.addressDetail} onChange={input('addressDetail')} /></Field>
      <Field label="재학 학교 *" error={errors.schoolName}><input className="input" value={value.schoolName} onChange={input('schoolName')} aria-invalid={!!errors.schoolName} /></Field>
      <Field label="학생 연락처 *" error={errors.phone}><input className="input" value={value.phone} onChange={input('phone')} aria-invalid={!!errors.phone} placeholder="국가번호 포함 가능" /></Field>
      {value.country !== 'KR' && <Field label="카카오톡 ID *" error={errors.kakaoId}><input className="input" value={value.kakaoId} onChange={input('kakaoId')} aria-invalid={!!errors.kakaoId} /></Field>}
      {showStatus && <Field label="등록 상태">
        <select className="input" value={value.status} onChange={(event) => onChange({ status: event.target.value as StudentStatus })}>
          {STATUSES.map((status) => <option key={status} value={status}>{STUDENT_STATUS_LABEL[status]}</option>)}
        </select>
      </Field>}
      <div className="sm:col-span-2 lg:col-span-3"><Field label="상담 주제 *" error={errors.counselTopic}><textarea className="input min-h-20 py-2" value={value.counselTopic} onChange={input('counselTopic')} aria-invalid={!!errors.counselTopic} /></Field></div>
      <div className="sm:col-span-2 lg:col-span-3"><Field label="내부 메모"><textarea className="input min-h-20 py-2" value={value.memo} onChange={input('memo')} /></Field></div>
    </div>
  );
}
