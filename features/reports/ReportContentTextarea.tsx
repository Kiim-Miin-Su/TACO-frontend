'use client';
// [TBO-89b owner 지시 2026-08-07] 리포트 본문 단일 텍스트 박스 — **작성 폼과 템플릿 편집 모달이
//  같은 컴포넌트를 소비한다**(내용·이해도·특이사항·진도·숙제를 한 본문으로, 기본 양식 placeholder).
//  합성 규칙은 lib/domain/report-template.composeReportText 하나뿐 — 여기서 재계산하지 않는다.
import { DEFAULT_REPORT_SCAFFOLD } from '@/lib/domain/report-template';

export function ReportContentTextarea({
  value,
  onChange,
  disabled = false,
  maxLength,
  className = 'input h-40 py-2 leading-relaxed',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <textarea
      className={className}
      placeholder={DEFAULT_REPORT_SCAFFOLD}
      value={value}
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
