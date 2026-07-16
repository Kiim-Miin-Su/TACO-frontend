// [B6 C1 2026-07-16] ScheduleCalendar 인라인 사설 모달 3종 → ModalShell 이관 + 파일 분리(E1 + EP9 선행 절단).
//  강사 승인 요청 모달: 수업 변경 / 수업 삭제 / 가용·불가 변경(영향 수업 고지). 사유 필수·반복 scope 선택은
//  기존 규칙 그대로 — 셸(포커스 트랩·Escape·backdrop·aria)만 공용 계층으로 통일.
"use client";
import { useState } from "react";
import type { ScheduleRow } from "@/types";
import type { SchedulePatchBody, AvailabilityUpsertBody } from "@/lib/api";
import type { RecurrenceScope } from "@kms545487/contracts";
import { Field, ModalShell } from "@/components/ui";
import { applyScheduleRowPatch } from "@/lib/domain/schedule-row";

// 승인 요청 드래프트 타입 — ScheduleCalendar(상태 보유자)와 모달이 공유하는 계약.
export type ScheduleChangeApprovalDraft = { row: ScheduleRow; patch: SchedulePatchBody; label: string };
export type ScheduleDeleteApprovalDraft = { row: ScheduleRow };
export type AvailabilityImpact = { sessionId: number; sessionDate: string; startTime?: string; endTime?: string; reason?: string };
export type AvailabilityApprovalDraft =
  | { action: "upsert"; body: AvailabilityUpsertBody; impacted: AvailabilityImpact[]; summary: string }
  | { action: "delete"; targetAvailabilityId: number; impacted: AvailabilityImpact[]; summary: string };

// 반복 적용 범위 선택(수업 변경·삭제 요청 공용) — 시리즈가 있을 때만 노출.
function ScopePicker({ scope, onChange }: { scope: RecurrenceScope; onChange: (s: RecurrenceScope) => void }) {
  return (
    <Field label="반복 적용 범위">
      <div className="grid grid-cols-3 gap-2">
        {([["this", "이번 수업만"], ["this_and_following", "이번 이후"], ["all", "전체 반복"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`btn btn-sm ${scope === value ? "btn-primary" : ""}`}
            onClick={() => onChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </Field>
  );
}

// 요청 사유(필수) — 3개 요청 모달 공용 규격(maxLength 500, 제출 버튼 게이트는 호출부).
function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Field label="요청 사유">
      <textarea
        className="input min-h-[96px] resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        placeholder={placeholder}
      />
    </Field>
  );
}

export function ScheduleChangeApprovalModal({
  draft, onClose, onSubmit,
}: {
  draft: ScheduleChangeApprovalDraft;
  onClose: () => void;
  onSubmit: (requestReason: string, scope: RecurrenceScope) => void;
}) {
  const next = applyScheduleRowPatch(draft.row, draft.patch);
  const [requestReason, setRequestReason] = useState("");
  const [scope, setScope] = useState<RecurrenceScope>((draft.patch.scope as RecurrenceScope | undefined) ?? "this");
  const reason = requestReason.trim();
  const hasSeries = draft.row.seriesId != null;
  return (
    <ModalShell
      title="수업 변경 승인 요청"
      onClose={onClose}
      size="md"
      bodyClassName="space-y-3 text-body text-fg-muted"
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={!reason} onClick={() => onSubmit(reason, hasSeries ? scope : "this")}>승인 요청 보내기</button>
        </>
      )}
    >
      <p>강사는 확정된 수업을 직접 변경할 수 없습니다. 아래 변경안을 승인센터로 보냅니다.</p>
      <div className="rounded-md border overflow-hidden">
        <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">{draft.label}</div>
        <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 px-3 py-2 text-caption">
          <span className="text-fg-subtle">현재</span>
          <span className="mono">{draft.row.sessionDate} {draft.row.startTime}{draft.row.endTime ? `~${draft.row.endTime}` : ""}</span>
          <span className="text-fg-subtle">요청</span>
          <span className="mono">{next.sessionDate} {next.startTime}{next.endTime ? `~${next.endTime}` : ""}</span>
          <span className="text-fg-subtle">수업</span>
          <span>{draft.row.courseName} · {draft.row.instructorName}</span>
        </div>
      </div>
      {hasSeries && <ScopePicker scope={scope} onChange={setScope} />}
      <ReasonField value={requestReason} onChange={setRequestReason} placeholder="예: 학부모 요청으로 이번 수업 시간을 30분 늦춰야 합니다." />
    </ModalShell>
  );
}

export function ScheduleDeleteApprovalModal({
  draft, onClose, onSubmit,
}: {
  draft: ScheduleDeleteApprovalDraft;
  onClose: () => void;
  onSubmit: (requestReason: string, scope: RecurrenceScope) => void;
}) {
  const r = draft.row;
  const [requestReason, setRequestReason] = useState("");
  const [scope, setScope] = useState<RecurrenceScope>("this");
  const reason = requestReason.trim();
  const hasSeries = r.seriesId != null;
  return (
    <ModalShell
      title="수업 삭제 승인 요청"
      onClose={onClose}
      size="md"
      bodyClassName="space-y-3 text-body text-fg-muted"
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={!reason} onClick={() => onSubmit(reason, hasSeries ? scope : "this")}>삭제 승인 요청 보내기</button>
        </>
      )}
    >
      <p>강사는 확정된 수업을 직접 삭제할 수 없습니다. 아래 수업 삭제안을 승인센터로 보냅니다.</p>
      <div className="rounded-md border overflow-hidden">
        <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">삭제 요청 대상</div>
        <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 px-3 py-2 text-caption">
          <span className="text-fg-subtle">일시</span>
          <span className="mono">{r.sessionDate} {r.startTime}{r.endTime ? `~${r.endTime}` : ""}</span>
          <span className="text-fg-subtle">수업</span>
          <span>{r.courseName} · {r.instructorName}</span>
          <span className="text-fg-subtle">강의실</span>
          <span>{r.roomName ?? "미지정"}</span>
        </div>
      </div>
      {hasSeries && <ScopePicker scope={scope} onChange={setScope} />}
      <ReasonField value={requestReason} onChange={setRequestReason} placeholder="예: 학생 요청으로 이번 수업을 취소해야 합니다." />
    </ModalShell>
  );
}

export function AvailabilityApprovalModal({
  draft, rows, onClose, onSubmit,
}: {
  draft: AvailabilityApprovalDraft;
  rows: ScheduleRow[];
  onClose: () => void;
  onSubmit: (requestReason: string) => void;
}) {
  const [requestReason, setRequestReason] = useState("");
  const reason = requestReason.trim();
  const impacted = draft.impacted.map((x) => {
    const row = rows.find((r) => r.id === x.sessionId);
    return {
      id: x.sessionId,
      title: row ? `${row.courseName} · ${row.instructorName}` : `수업 #${x.sessionId}`,
      time: `${x.sessionDate} ${x.startTime ?? row?.startTime ?? ""}${x.endTime ?? row?.endTime ? `~${x.endTime ?? row?.endTime}` : ""}`,
    };
  });
  return (
    <ModalShell
      title="승인 요청 필요"
      onClose={onClose}
      size="md"
      bodyClassName="space-y-2"
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={!reason} onClick={() => onSubmit(reason)}>승인 요청 보내기</button>
        </>
      )}
    >
      <p className="text-body text-fg-muted">
        {draft.summary} 변경은 이미 잡힌 수업에 영향을 줍니다. 승인센터로 요청을 보냅니다.
      </p>
      <div className="rounded-md border overflow-hidden">
        <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">영향 수업 {impacted.length}건</div>
        <div className="divide-y max-h-48 overflow-y-auto">
          {impacted.map((x) => (
            <div key={x.id} className="px-3 py-2">
              <div className="text-body font-medium">{x.title}</div>
              <div className="text-caption text-fg-muted mono">{x.time}</div>
            </div>
          ))}
        </div>
      </div>
      <ReasonField value={requestReason} onChange={setRequestReason} placeholder="예: 이미 잡힌 수업과 겹치지만 해당 시간대를 온라인만 가능으로 바꿔야 합니다." />
    </ModalShell>
  );
}
