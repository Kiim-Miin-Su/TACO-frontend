// [B6 C1 2026-07-16] ScheduleCalendar 인라인 사설 모달 → ModalShell 이관 + 파일 분리(E1 + EP9 선행 절단).
//  가용/불가/온라인만 블록 수정+삭제(더블클릭 진입). 폼 검증(시작<종료·기간 순서)은 기존 규칙 그대로.
"use client";
import { useState } from "react";
import type { AvailabilityBlock } from "@/types";
import type { AvailabilityUpsertBody } from "@/lib/api";
import { Field, ModalShell } from "@/components/ui";
import { WEEKDAYS_KO as WD } from "@/lib/domain/schedule";
import { AVAILABILITY_KIND_LABEL } from "@/lib/domain/approvals";

export function BlockEditModal({
  block, onClose, onSave, onDelete,
}: {
  block: AvailabilityBlock;
  onClose: () => void;
  onSave: (body: AvailabilityUpsertBody) => void;
  onDelete: () => void;
}) {
  const [kind, setKind] = useState<AvailabilityBlock["kind"] | "online_only">(block.kind);
  const [weekday, setWeekday] = useState<number>(block.weekday);
  const [start, setStart] = useState(block.startTime);
  const [end, setEnd] = useState(block.endTime);
  const [from, setFrom] = useState(block.effectiveFrom ?? "");
  const [to, setTo] = useState(block.effectiveTo ?? "");
  const periodOk = !from || !to || from <= to;
  const valid = start < end && periodOk;
  return (
    <ModalShell
      title={`${AVAILABILITY_KIND_LABEL[kind]} 수정`}
      onClose={onClose}
      size="sm"
      bodyClassName="space-y-3"
      footer={(
        <>
          {/* 삭제는 좌측 분리(파괴적 액션 — 저장 동선과 시각 구분) */}
          <button className="btn btn-sm text-danger mr-auto" onClick={onDelete}>삭제</button>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={!valid}
            onClick={() => onSave({ id: block.id, ownerType: block.ownerType, ownerId: block.ownerId, kind, weekday, startTime: start, endTime: end, effectiveFrom: from || undefined, effectiveTo: to || undefined })}>
            저장
          </button>
        </>
      )}
    >
      <Field label="종류">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="unavailable">불가(차단)</option>
          <option value="available">가용</option>
          <option value="online_only">온라인만 가능</option>
        </select>
      </Field>
      <Field label="요일">
        <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {WD.map((w, d) => <option key={d} value={d}>{w}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작"><input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="종료"><input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="기간 시작 (선택)"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="기간 종료 (선택)"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <p className="text-caption text-fg-muted">매주 {WD[weekday]}요일 반복. 기간을 비우면 무기한, 지정하면 그 기간에만 적용.</p>
      {!periodOk && <p className="text-caption text-danger" role="alert">기간 시작이 종료보다 늦을 수 없습니다.</p>}
    </ModalShell>
  );
}
