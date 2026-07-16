// [B6 C4/EP9 2026-07-16] 월간 그리드 — ScheduleCalendar에서 파일 분리(표시 전용 서브컴포넌트, 동작 불변).
//  셀 더블클릭=일정 추가, 날짜 클릭=일간 보기, 이벤트 클릭=상세. 데이터·핸들러는 전부 부모 소유.
"use client";
import { useMemo } from "react";
import type { ScheduleRow } from "@/types";
import { weekdayOf, pad2 as pad, WEEKDAYS_KO as WD } from "@/lib/domain/schedule";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function MonthGrid({
  anchor,
  rows,
  colorOf,
  onPick,
  onPickDay,
  onCreateDay,
}: {
  anchor: string;
  rows: ScheduleRow[];
  colorOf: (r: ScheduleRow) => string;
  onPick: (r: ScheduleRow) => void;
  onPickDay: (date: string) => void;
  onCreateDay: (date: string) => void;
}) {
  const ym = anchor.slice(0, 7);
  const firstWd = weekdayOf(`${ym}-01`);
  const last = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(firstWd).fill(null),
    ...Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`),
  ];
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    rows.forEach((r) => {
      const a = m.get(r.sessionDate) ?? [];
      a.push(r);
      m.set(r.sessionDate, a);
    });
    m.forEach((a) => a.sort((x, y) => (x.startTime ?? "").localeCompare(y.startTime ?? "")));
    return m;
  }, [rows]);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b">
        {WD.map((w, i) => (
          <div
            key={w}
            className={`px-3 py-2 text-caption font-semibold ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-fg-muted"}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => (
          <div
            key={idx}
            className={`min-h-[104px] border-b border-r p-1.5 ${date ? "cursor-pointer" : ""}`}
            style={{ borderColor: "var(--color-line-muted)" }}
            onDoubleClick={(e) => { if (date && (e.target as HTMLElement).closest("[data-evt]") == null) onCreateDay(date); }}
            title={date ? "더블클릭으로 일정 추가" : undefined}
          >
            {date && (
              <button
                className={`text-caption mb-1 px-1 rounded hover:bg-canvas-subtle ${date === todayISO() ? "font-bold text-accent" : "text-fg-subtle"}`}
                onClick={() => onPickDay(date)}
                title="일간 보기"
              >
                {Number(date.slice(8))}
              </button>
            )}
            <div className="space-y-1">
              {(date ? (byDay.get(date) ?? []) : []).slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  data-evt
                  onClick={() => onPick(r)}
                  onDoubleClick={(e) => { e.stopPropagation(); onPick(r); }}
                  className="block w-full text-left rounded px-1.5 py-0.5 text-micro text-white truncate"
                  style={{ background: colorOf(r) }}
                  title={`${r.startTime ?? ""}–${r.endTime ?? ""} ${r.courseName} · ${r.instructorName}`}
                >
                  <span className="mono">
                    {r.startTime ?? ""}–{r.endTime ?? ""}
                  </span>{" "}
                  {r.courseName}
                </button>
              ))}
              {date && (byDay.get(date)?.length ?? 0) > 4 && (
                <button className="text-micro text-fg-muted hover:underline px-1" onClick={() => onPickDay(date)}>
                  +{(byDay.get(date)?.length ?? 0) - 4} 더보기
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
