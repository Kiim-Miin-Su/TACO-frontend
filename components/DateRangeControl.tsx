"use client";

export type DateRange = { from: string; to: string };

export function DateRangeControl({
  value,
  onChange,
  allowClear = false,
  onClear,
  label = "기간",
}: {
  value: DateRange | null;
  onChange: (range: DateRange) => void;
  allowClear?: boolean;
  onClear?: () => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-1 text-caption text-fg-muted min-w-0">
      <span className="shrink-0">{label}</span>
      <input
        type="date"
        aria-label={`${label} 시작일`}
        className="input h-7 px-1.5 text-caption w-[120px] min-w-0"
        value={value?.from ?? ""}
        onChange={(event) => {
          const from = event.target.value;
          if (!from) return;
          onChange({ from, to: value?.to && value.to >= from ? value.to : from });
        }}
      />
      <span aria-hidden="true">~</span>
      <input
        type="date"
        aria-label={`${label} 종료일`}
        className="input h-7 px-1.5 text-caption w-[120px] min-w-0"
        value={value?.to ?? ""}
        min={value?.from}
        disabled={!value}
        onChange={(event) => {
          const to = event.target.value;
          if (!to || !value) return;
          onChange({ from: value.from, to: to >= value.from ? to : value.from });
        }}
      />
      {allowClear && value && onClear && (
        <button type="button" className="btn btn-sm h-7 w-7 p-0 shrink-0" onClick={onClear} title={`${label} 해제`} aria-label={`${label} 해제`}>
          ×
        </button>
      )}
    </label>
  );
}
