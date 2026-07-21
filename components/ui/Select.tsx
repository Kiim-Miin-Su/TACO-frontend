'use client';
// [재사용 2026-07-07] 공용 셀렉트 — `<select className="input">` + 옵션 반복 패턴을 한 컴포넌트로.
//  상담 폼/상세의 하드코딩 <option> 블록을 대체(각 select ~5줄 → 1줄). 값 문자열만 다루고
//  onChange는 (value)만 넘긴다(e.target.value 반복 제거). enum은 enumOptions(labels)로 옵션 생성.
//  예) <Select value={status} onChange={setStatus} />
//        options={enumOptions(startLabel)} empty="선택 안 함" />
import type { SelectOption } from '@/lib/enumOptions';

export function Select({
  value,
  onChange,
  options,
  empty,
  className = 'input',
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  empty?: string; // 지정 시 맨 위 빈 옵션('선택 안 함' 등)
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
