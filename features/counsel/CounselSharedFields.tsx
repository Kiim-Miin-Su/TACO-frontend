'use client';

import { useEffect, useState } from 'react';
import { Field } from '@/components/ui';
import {
  counselKstPartsToInstant,
  EMPTY_COUNSEL_KST_DATE_TIME,
  instantToCounselKstParts,
  type CounselKstDateTime,
} from '@/lib/domain/counsel-time';

export const COUNSEL_CONTENT_LABEL = '상담 내용';
export const COUNSEL_CONTENT_PLACEHOLDER = '상담 내용을 기록해 주세요';

export function CounselContentField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={COUNSEL_CONTENT_LABEL}>
      <textarea
        className="input h-24 py-2"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={COUNSEL_CONTENT_PLACEHOLDER}
      />
    </Field>
  );
}

export function CounselNextContactField({
  value,
  onChange,
  disabled = false,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [parts, setParts] = useState<CounselKstDateTime>(() => instantToCounselKstParts(value));
  const [undecided, setUndecided] = useState(value == null);

  useEffect(() => {
    setParts(instantToCounselKstParts(value));
    setUndecided(value == null);
  }, [value]);

  const changePart = (patch: Partial<CounselKstDateTime>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    const instant = counselKstPartsToInstant(next);
    if (instant) onChange?.(instant);
  };

  const toggleUndecided = (checked: boolean) => {
    setUndecided(checked);
    if (checked) {
      setParts(EMPTY_COUNSEL_KST_DATE_TIME);
      onChange?.(null);
    }
  };

  return (
    <Field label="다음 상담 예정 일시" hint="한국 시간(KST) 기준">
      <div className="space-y-2">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="date"
            name="nextContactDate"
            aria-label="다음 상담 예정 날짜"
            className="input min-w-0"
            disabled={disabled || undecided}
            value={parts.date}
            onChange={(event) => changePart({ date: event.target.value })}
          />
          <input
            type="time"
            name="nextContactTime"
            aria-label="다음 상담 예정 시간"
            className="input min-w-0"
            disabled={disabled || undecided}
            value={parts.time}
            onChange={(event) => changePart({ time: event.target.value })}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-caption text-fg-muted">
          <input
            type="checkbox"
            checked={undecided}
            disabled={disabled}
            onChange={(event) => toggleUndecided(event.target.checked)}
          />
          일정 미정
        </label>
      </div>
    </Field>
  );
}
