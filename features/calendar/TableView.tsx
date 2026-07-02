"use client";
import type { ScheduleRow, AvailabilityBlock } from "@/types";
import { weekdayOf, toMin } from "@/lib/domain/schedule";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 09:00 ~ 21:00
const pad = (n: number) => String(n).padStart(2, "0");

// 주간 표(시간×요일) 뷰 — 캘린더 탭에 통합된 "표" 모드. 시간대별 배치를 한눈에.
export function TableView({
  dates, rows, blocks, colorOf, labelOf, onPick,
}: {
  dates: string[];
  rows: ScheduleRow[];
  blocks: AvailabilityBlock[]; // 선택 자원의 불가시간(Block) — 회색 셀
  colorOf: (r: ScheduleRow) => string;
  labelOf: (r: ScheduleRow) => string;
  onPick: (r: ScheduleRow) => void;
}) {
  const isBlocked = (date: string, hour: number) =>
    blocks.some((b) => b.kind === "unavailable" && b.weekday === weekdayOf(date) &&
      toMin(b.startTime) < (hour + 1) * 60 && hour * 60 < toMin(b.endTime));

  return (
    <div className="card overflow-x-auto">
      <table className="table" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ width: 64 }}>시간</th>
            {dates.map((d) => (
              <th key={d} className="text-center">
                {WD[weekdayOf(d)]}<span className="text-fg-subtle font-normal"> {d.slice(5)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <td className="mono text-fg-muted align-top">{pad(h)}:00</td>
              {dates.map((d) => {
                const cell = rows.filter((r) => r.sessionDate === d && r.startTime && toMin(r.startTime) >= h * 60 && toMin(r.startTime) < (h + 1) * 60);
                const blocked = isBlocked(d, h);
                return (
                  <td key={d} className="align-top" style={blocked ? { background: "var(--color-neutral-subtle)" } : undefined}>
                    <div className="space-y-1">
                      {cell.map((r) => (
                        <button key={r.id} onClick={() => onPick(r)}
                          className="block w-full text-left rounded px-1.5 py-1 text-[11px] leading-tight text-white truncate"
                          style={{ background: colorOf(r) }}
                          title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"} · ${r.startTime}-${r.endTime}`}>
                          <div className="font-semibold truncate">{labelOf(r)}</div>
                          <div className="opacity-90 mono">{r.startTime}–{r.endTime} · {r.roomName ?? "-"}</div>
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
