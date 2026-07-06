"use client";
// [참조/처리] 우측 위 패널 — 필터 결과 수업을 날짜 오름차순 리스트로(Lantiv 우측 'Changes' 리스트 대응).
//  - 데이터: 부모(ScheduleCalendar)의 filtered(ScheduleRow[])를 그대로 받음 — 별도 fetch 없음(단일 소스).
//  - 그룹 토글: 날짜순 ↔ 리소스별 그룹(학생 선택 시 학생별 → 그룹 내 날짜순) — lib/domain/lantiv.groupSessions.
//  - 클릭 = 세션 선택 → 아래 SessionDetailPanel + 그리드 하이라이트(부모 콜백).
import { useMemo } from "react";
import type { ScheduleRow } from "@/types";
import { groupSessions, isGroupSession, type ListGroupBy } from "@/lib/domain/lantiv";
import { WEEKDAYS_KO as WD, crossMidnightEnd } from "@/lib/domain/schedule"; // [R-9] 자정 크로스 익일 종료 표기

const GROUP_LABEL: Record<Exclude<ListGroupBy, "none">, string> = {
  student: "학생별",
  instructor: "강사별",
  room: "강의실별",
};

export function SessionListPanel({
  rows, groupBy, groupDim, onToggleGroup, selectedId, onPick, colorOf, emptyHint,
}: {
  rows: ScheduleRow[];
  groupBy: ListGroupBy; // 'none'(날짜순) 또는 groupDim
  groupDim: Exclude<ListGroupBy, "none">; // 토글 시 사용할 그룹 차원(선택 필터에서 파생)
  onToggleGroup: () => void;
  selectedId: number | null;
  onPick: (r: ScheduleRow) => void;
  colorOf: (r: ScheduleRow) => string;
  emptyHint?: string; // 빈 사유 맥락(기간·개인 필터) — '왜 없지?' 혼동 방지(UX QA 2026-07-03)
}) {
  const groups = useMemo(() => groupSessions(rows, groupBy), [rows, groupBy]);
  return (
    <div className="card overflow-hidden">
      <div
        className="px-3 h-10 flex items-center justify-between border-b"
       
      >
        <span className="text-body font-semibold">수업 리스트</span>
        <span className="inline-flex items-center gap-1.5 text-caption text-fg-subtle">
          {rows.length}건
          <button
            className={`btn btn-sm h-6 px-1.5 ${groupBy !== "none" ? "badge-accent" : ""}`}
            onClick={onToggleGroup}
            title={`그룹 토글: 날짜순 ↔ ${GROUP_LABEL[groupDim]}`}
          >
            {groupBy === "none" ? "날짜순" : GROUP_LABEL[groupDim]}
          </button>
        </span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {groups.map((g) => (
          <div key={g.key}>
            {g.label && (
              <div
                className="px-3 py-1 text-micro font-semibold text-fg-muted sticky top-0 bg-canvas-subtle border-b border-line-muted"
              >
                {g.label} <span className="text-fg-subtle font-normal">({g.rows.length})</span>
              </div>
            )}
            {g.rows.map((r) => {
              const on = selectedId === r.id;
              return (
                <button
                  key={`${g.key}-${r.id}`}
                  onClick={() => onPick(r)}
                  className={`w-full text-left px-3 py-1.5 border-b border-line-muted flex items-start gap-2 ${on ? "bg-neutral-subtle" : "hover:bg-canvas-subtle"}`}
                >
                  <span className="inline-block w-1 self-stretch rounded-full shrink-0" style={{ background: colorOf(r) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption mono text-fg-muted">
                      {r.sessionDate.slice(5)} ({WD[r.weekday]}) {r.startTime ?? ""}–{r.endTime ?? (crossMidnightEnd(r) ? `익일 ${crossMidnightEnd(r)}` : "")}
                    </span>
                    <span className={`block text-body truncate ${on ? "font-semibold" : ""}`}>
                      {r.courseName}
                      {isGroupSession(r) && <span className="ml-1 text-micro text-fg-subtle">그룹 {r.studentIds.length}명</span>}
                    </span>
                    <span className="block text-micro text-fg-subtle truncate">
                      {r.instructorName}
                      {r.roomName ? ` · ${r.roomName}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {!rows.length && (
          <div className="text-caption text-fg-subtle text-center py-6">
            필터에 맞는 수업 없음
            {emptyHint && <div className="mt-1 text-micro">{emptyHint}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
