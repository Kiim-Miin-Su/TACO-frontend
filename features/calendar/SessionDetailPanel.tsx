"use client";
// [참조/처리] 우측 아래 패널 — 선택 수업 상세(Lantiv 'Properties' 대응).
//  - 표시: ScheduleRow DTO 그대로(날짜·시간·그룹·학생·과목·강사·강의실·상태·강사출결·메모) — FABLE §4.1.
//  - 속성 변경(색·상태·강의실·메모)은 부모 requestChange 경유 → PATCH /schedule/:id
//    (반복 시리즈면 부모가 범위(scope) 확인 → 관련 조인·시수 무효화는 백엔드+쿼리 invalidate가 담당).
//  - 더블클릭 상세편집 모달은 유지 — "상세 편집" 버튼으로도 진입(onOpenModal).
import { useState } from "react";
import Link from "next/link";
import type { Room, ScheduleRow } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import { WEEKDAYS_KO as WD, crossMidnightEnd } from "@/lib/domain/schedule"; // [R-9] 자정 크로스 익일 종료 표기
import { INSTRUCTOR_ATT_LABEL, STATUS_LABEL, isGroupSession } from "@/lib/domain/lantiv";
import { SessionEditFields } from "./SessionEditFields";
// [피드백 2026-07-03] 스케줄 선택 시 참여 학생·강사 정보 동시 표시 — 캐시 공유 훅(중복 fetch 0)
import { useStudents, useInstructors } from "@/lib/queries";
import { CountryBadge } from "./CountryInput";
import { STUDENT_STATUS_LABEL } from "@/lib/domain/students";
import { ChangeHistory } from "./ChangeHistory"; // [R-6] 변경 이력(audit) — 관리자

export function SessionDetailPanel({
  row, rooms, instructors, canEdit, colorOf, onPatch, onDelete, onOpenModal, onPickStudent, onPickInstructor,
}: {
  row: ScheduleRow | null;
  rooms: Room[];
  instructors: { id: number; name: string }[];
  canEdit: boolean;
  colorOf: (r: ScheduleRow) => string;
  onPatch: (r: ScheduleRow, patch: SchedulePatchBody, label: string) => void;
  onDelete?: (r: ScheduleRow) => void;
  onOpenModal: (r: ScheduleRow) => void;
  onPickStudent?: (id: number, name: string) => void; // 학생명 클릭 → 유저 상세·편집(피드백 2026-07-03 #2)
  onPickInstructor?: (id: number, name: string) => void; // 강사 클릭 → 강사 개인 뷰
}) {
  // 참여자 정보(피드백 2026-07-03): 세션의 학생(국가·상태·학년)·강사(담당 과목) 요약을 함께 표시.
  const { data: allStudents = [] } = useStudents();
  const { data: allInstructors = [] } = useInstructors();
  // [R-6] audit 행위자 id → 이름(강사면 이름, 그 외 관리자). 강사 식별자 통일(id=users.id).
  const actorName = (id: number) => allInstructors.find((i) => Number(i.id) === id)?.name ?? `관리자 #${id}`;
  // 편집 모드(TBO-10 #3): DetailModal과 동일한 SessionEditFields 공통 폼 — 모든 input 편집 가능.
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = row != null && editingId === row.id;

  if (!row) {
    return (
      <div className="card card-pad text-caption text-fg-subtle">
        수업을 클릭하면 상세 정보가 여기에 표시됩니다.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-3 h-10 flex items-center gap-2 border-b">
        <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(row) }} />
        {/* 제목 클릭 = 수업 상세 페이지(학생 출결 관리) — 피드백 2026-07-02 */}
        <Link
          href={`/sessions/${row.id}`}
          className="text-body font-semibold truncate flex-1 hover:underline text-accent"
          title="수업 상세 페이지로 — 학생 출결 관리"
        >
          {row.courseName} →
        </Link>
        {row.seriesId != null && <span className="badge badge-accent">반복</span>}
      </div>
      <div className="card-pad space-y-2.5">
        {editing && row ? (
          <SessionEditFields
            row={row}
            rooms={rooms}
            instructors={instructors}
            compact
            onSave={(patch, label) => { setEditingId(null); onPatch(row, patch, label); }}
            onCancel={() => setEditingId(null)}
            onDelete={onDelete ? () => onDelete(row) : undefined}
          />
        ) : (
          <>
        {/* ScheduleRow DTO 그대로 렌더 */}
        <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-body">
          <dt className="text-fg-muted">날짜</dt>
          <dd>
            {row.sessionDate} ({WD[row.weekday]})
          </dd>
          <dt className="text-fg-muted">시간</dt>
          <dd className="mono">
            {row.startTime ?? "-"}–{row.endTime ?? (crossMidnightEnd(row) ? `익일 ${crossMidnightEnd(row)}` : "-")} ({row.durationMinutes}분)
          </dd>
          <dt className="text-fg-muted">과목</dt>
          <dd>{row.subjectName}</dd>
          <dt className="text-fg-muted">강사</dt>
          <dd>
            <button
              className="text-accent hover:underline"
              title={`${row.instructorName} 개인 스케줄 보기`}
              onClick={() => onPickInstructor?.(Number(row.instructorId), row.instructorName)}
            >
              {row.instructorName}
            </button>
            {(() => {
              const inst = allInstructors.find((i) => Number(i.id) === Number(row.instructorId));
              return inst?.subjectName ? <span className="ml-1 text-micro text-fg-subtle">{inst.subjectName}</span> : null;
            })()}
          </dd>
          <dt className="text-fg-muted">학생</dt>
          <dd className="space-y-0.5">
            {/* 학생명 클릭 = 우측 유저 상세에서 국가(출국/입국)·상태(휴원 등) 즉시 수정(피드백 2026-07-03)
                + 국기·상태·학년 미니 정보 동시 표시(CountryBadge·STUDENT_STATUS_LABEL 단일 소스) */}
            {row.studentNames?.length
              ? row.studentNames.map((n, i) => {
                  const sid = Number((row.studentIds ?? [])[i]);
                  const st = allStudents.find((x) => Number(x.id) === sid);
                  return (
                    <div key={`${n}${i}`} className="flex items-center gap-1.5">
                      <button
                        className="text-accent hover:underline"
                        title={`${n} 상세·정보 수정`}
                        onClick={() => onPickStudent?.(sid, n)}
                      >
                        {n}
                      </button>
                      {st && (
                        <span className="text-micro text-fg-subtle inline-flex items-center gap-1">
                          <CountryBadge code={st.country} />
                          {st.grade != null && <span>{st.grade}학년</span>}
                          <span style={{ color: st.status !== "active" ? "var(--color-attention)" : undefined }}>
                            {STUDENT_STATUS_LABEL[st.status] ?? st.status}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })
              : "—"}
            {isGroupSession(row) && <span className="text-micro text-fg-subtle">(그룹)</span>}
          </dd>
          <dt className="text-fg-muted">강사출결</dt>
          <dd>{row.instructorAttendance ? INSTRUCTOR_ATT_LABEL[row.instructorAttendance] : "—"}</dd>
          {row.topic && (
            <>
              <dt className="text-fg-muted">주제</dt>
              <dd>{row.topic}</dd>
            </>
          )}
        </dl>

        <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-body">
          <dt className="text-fg-muted">상태</dt>
          <dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
          <dt className="text-fg-muted">메모</dt>
          <dd className="whitespace-pre-wrap">{row.memo ? row.memo : <span className="text-fg-subtle">—</span>}</dd>
        </dl>
        {/* [QA 2026-07-03] 좁은 우측 패널(w-64)에서 버튼 2개가 카드 밖으로 밀리던 오버플로 — flex-wrap 허용 */}
        <div className="flex justify-between gap-2 flex-wrap">
          {canEdit ? (
            <button className="btn btn-sm btn-primary" onClick={() => setEditingId(row.id)}>
              편집 — 모든 항목
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-sm" onClick={() => onOpenModal(row)}>
            모달로 크게…
          </button>
        </div>

        {/* [R-6] 변경 이력(audit) — 관리자만. 접이식(기본 접힘). 세션 CRUD·강사 출결 변경 추적. */}
        {canEdit && (
          <details className="mt-1 border-t pt-2">
            <summary className="text-caption text-fg-muted cursor-pointer select-none">변경 이력</summary>
            <div className="mt-2 max-h-[220px] overflow-y-auto">
              <ChangeHistory sessionId={row.id} actorName={actorName} />
            </div>
          </details>
        )}
          </>
        )}
      </div>
    </div>
  );
}
