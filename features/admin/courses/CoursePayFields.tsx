'use client';

import { Field } from '@/components/ui';

export type CoursePayForm = { hourlyRateOverride: string; isKinder: boolean };
export type CourseInstructorPay = { defaultHourlyRate: number; canTeachKinder: boolean };

export function CoursePayFields({
  value,
  instructor,
  onChange,
}: {
  value: CoursePayForm;
  instructor?: CourseInstructorPay;
  onChange: (next: CoursePayForm) => void;
}) {
  return (
    <>
      <Field label="수업 시급 override (원/시간)">
        <input className="input" type="number" min={1} max={100000000} value={value.hourlyRateOverride}
          onChange={(e) => onChange({ ...value, hourlyRateOverride: e.target.value })}
          placeholder={instructor ? `비우면 기본 ${instructor.defaultHourlyRate.toLocaleString('ko-KR')}원` : '강사를 먼저 선택'} />
        <span className="block text-micro text-fg-subtle mt-1">
          {value.hourlyRateOverride ? '이 수업에만 별도 시급을 적용합니다.' : `강사 기본 시급 ${instructor?.defaultHourlyRate.toLocaleString('ko-KR') ?? '—'}원 적용`}
        </span>
      </Field>
      <Field label="Kinder 수업">
        <label className="h-10 flex items-center gap-2">
          <input type="checkbox" checked={value.isKinder} onChange={(e) => onChange({ ...value, isKinder: e.target.checked })} />
          <span className="text-body">3~7세 대상</span>
        </label>
        {/* [TBO-61 2026-07-24] Kinder 가능 여부 차단 문구 제거(대표 지시 유연화) — 프로필 값은 정보 표시용 */}
      </Field>
    </>
  );
}
