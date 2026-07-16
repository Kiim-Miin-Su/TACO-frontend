// [B6 C1 2026-07-16] ScheduleCalendar 인라인 DetailModal → ModalShell 이관 + 파일 분리(E1 + EP9 선행 절단).
//  수업 상세/편집/삭제 — 편집 폼은 SessionEditFields 공통(우측 패널과 동일 폼·검증·패치 빌드).
"use client";
import { useState } from "react";
import Link from "next/link";
import type { ScheduleRow, Room } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import { ModalShell } from "@/components/ui";
import { weekdayOf, WEEKDAYS_KO as WD } from "@/lib/domain/schedule";
import { STATUS_LABEL } from "@/lib/domain/lantiv";
import { KST_TZ, type CountryInfo } from "@/lib/domain/tz";
import { SessionEditFields } from "../SessionEditFields";

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-fg-muted">{children}</dt>;
}

export function SessionDetailModal({
  row,
  rooms,
  instructors,
  colorOf,
  ownerTz,
  onClose,
  onSave,
  onDelete,
}: {
  row: ScheduleRow;
  rooms: Room[];
  instructors: { id: number; name: string }[];
  colorOf: (r: ScheduleRow) => string;
  ownerTz?: CountryInfo | null; // [이슈1] 비KST 편집이면 이 tz(현지 시각 입력 → 저장 시 KST 변환)
  onClose: () => void;
  onSave: (patch: SchedulePatchBody) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const isSeries = row.seriesId != null;

  return (
    <ModalShell
      size="md"
      onClose={onClose}
      bodyClassName="space-y-3"
      title={(
        <div className="flex items-start gap-2">
          <span className="inline-block w-3 h-3 rounded-sm mt-1.5 shrink-0" style={{ background: colorOf(row) }} />
          <div className="flex-1">
            <div className="font-semibold">{row.courseName}</div>
            <div className="text-fg-subtle text-caption font-normal">
              {row.subjectName} · {row.instructorName}
              {row.studentNames?.length ? ` · ${row.studentNames.join(", ")}` : ""}
            </div>
          </div>
          {isSeries && <span className="badge badge-accent">반복</span>}
        </div>
      )}
    >
      {mode === "detail" ? (
        <>
          <dl className="grid grid-cols-[64px_1fr] gap-y-1.5 text-body">
            <Dt>날짜</Dt>
            <dd>
              {row.sessionDate} ({WD[weekdayOf(row.sessionDate)]})
            </dd>
            <Dt>시간</Dt>
            <dd className="mono">
              {row.startTime ?? "-"} – {row.endTime ?? "-"} ({row.durationMinutes}분)
            </dd>
            <Dt>강의실</Dt>
            <dd>{row.roomName ?? "미지정"}</dd>
            <Dt>학생</Dt>
            <dd>{row.studentNames?.length ? row.studentNames.join(", ") : "—"}</dd>
            <Dt>상태</Dt>
            <dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
            {row.topic && (
              <>
                <Dt>주제</Dt>
                <dd>{row.topic}</dd>
              </>
            )}
            <Dt>메모</Dt>
            <dd className="whitespace-pre-wrap">{row.memo ? row.memo : <span className="text-fg-subtle">—</span>}</dd>
          </dl>
          <div className="flex justify-between gap-2 pt-1">
            <Link href={`/sessions/${row.id}`} className="btn btn-sm">
              강의 상세 페이지 →
            </Link>
            <div className="flex gap-2">
              <button className="btn btn-sm" onClick={onClose}>
                닫기
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => setMode("edit")}>
                편집
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {ownerTz && ownerTz.tz !== KST_TZ && (
            <p className="text-caption px-1 text-accent">
              🌐 {ownerTz.name} 현지 시각으로 입력하세요 — 저장 시 한국 시간(KST)으로 변환됩니다.
            </p>
          )}
          <SessionEditFields
            row={row}
            rooms={rooms}
            instructors={instructors}
            onSave={(patch) => onSave(patch)}
            onCancel={() => setMode("detail")}
            onDelete={onDelete}
          />
        </>
      )}
    </ModalShell>
  );
}
