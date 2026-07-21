'use client';

import { Field } from '@/components/ui';
import type { Course } from '@/types';
import { newClientId, type InterestFormValue } from './student-form-model';

type StudentInterestsFieldsProps = {
  value: InterestFormValue[];
  courses: Course[];
  onChange: (value: InterestFormValue[]) => void;
  error?: string;
};

export function StudentInterestsFields({ value, courses, onChange, error }: StudentInterestsFieldsProps) {
  const update = (clientId: string, patch: Partial<InterestFormValue>) => {
    onChange(value.map((item) => item.clientId === clientId ? { ...item, ...patch } : item));
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {value.map((interest, index) => (
        <div key={interest.clientId} className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_auto] gap-2 items-end border border-line-muted rounded-lg p-3">
          <Field label={`${index + 1}순위 유형`}>
            <select className="input" value={interest.target} onChange={(event) => update(interest.clientId, { target: event.target.value as InterestFormValue['target'], courseId: '', customLabel: '' })}>
              <option value="course">등록 코스</option><option value="custom">직접 입력</option>
            </select>
          </Field>
          {interest.target === 'course' ? (
            <Field label="희망 코스 *"><select className="input" value={interest.courseId} onChange={(event) => update(interest.clientId, { courseId: event.target.value })}><option value="">선택</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>
          ) : (
            <Field label="희망 수업명 *"><input className="input" value={interest.customLabel} onChange={(event) => update(interest.clientId, { customLabel: event.target.value })} placeholder="예: SAT Writing" /></Field>
          )}
          <div className="flex gap-1 justify-end">
            <button type="button" className="btn btn-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${index + 1}순위 위로`}>↑</button>
            <button type="button" className="btn btn-sm" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label={`${index + 1}순위 아래로`}>↓</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(value.filter((item) => item.clientId !== interest.clientId))} disabled={value.length <= 2}>삭제</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...value, { clientId: newClientId('interest'), target: 'course', courseId: '', customLabel: '' }])} disabled={value.length >= 20}>+ 희망 수업 추가</button>
      {error && <p className="text-caption text-danger" role="alert">{error}</p>}
    </div>
  );
}
