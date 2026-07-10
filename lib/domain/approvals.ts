// [C2C-b] 승인센터 상세 모달 — 순수 표시 헬퍼(테스트 대상).
//  availability 요청의 before(현재 블록) → after(요청 값) diff를 audit_log 스타일로 만든다.
//  데이터 원천: 요청 row(schedule_requests) + 현재 블록(qk.availability.all 조인) — 복제 저장 없음.

export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const AVAILABILITY_KIND_LABEL: Record<string, string> = {
  available: "가용시간",
  unavailable: "불가시간",
  online_only: "온라인만 가능",
};

export const REQUEST_KIND_LABEL: Record<string, string> = {
  session_create: "수업 생성 요청",
  session_update: "수업 변경 요청",
  session_delete: "수업 삭제 요청",
  availability_upsert: "가용/불가 변경 요청",
  availability_delete: "가용/불가 삭제 요청",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  approved: "승인됨",
  rejected: "반려됨",
};

// schedule_requests audit diff 라벨(ChangeHistory fieldLabels 병합용)
export const REQUEST_FIELD_LABEL: Record<string, string> = {
  requestKind: "요청 종류", requesterId: "요청자", status: "상태", requestReason: "요청 사유", reason: "반려 사유",
  decidedBy: "처리자", decidedAt: "처리 시각", createdSessionId: "생성 세션",
  targetSessionId: "대상 수업",
  targetAvailabilityId: "대상 블록", availabilityKind: "종류", availabilityWeekday: "요일",
  availabilityStartTime: "시작", availabilityEndTime: "종료",
  availabilityEffectiveFrom: "적용 시작", availabilityEffectiveTo: "적용 종료",
  impactSessionIds: "영향 수업", changeSummary: "요약",
  scope: "반복 적용 범위",
};

export const RECURRENCE_SCOPE_LABEL: Record<string, string> = {
  this: "이번 수업만",
  this_and_following: "이번 이후",
  all: "전체 반복",
};

export type DiffRow = { label: string; before: string; after: string; changed: boolean };

export type AvailabilityRequestLike = {
  requestKind?: string;
  targetAvailabilityId?: number;
  availabilityKind?: string;
  availabilityWeekday?: number;
  availabilityStartTime?: string;
  availabilityEndTime?: string;
  availabilityEffectiveFrom?: string;
  availabilityEffectiveTo?: string;
};

export type BlockLike = {
  kind: string;
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom?: string;
  effectiveTo?: string;
};

const effRange = (from?: string, to?: string) => (from || to ? `${from ?? "…"} ~ ${to ?? "…"}` : "상시(매주)");

// before = 현재 블록(없으면 신규), after = 요청 값(삭제 요청이면 "(삭제)").
export function availabilityRequestDiff(r: AvailabilityRequestLike, block?: BlockLike | null): DiffRow[] {
  const isDelete = r.requestKind === "availability_delete";
  const before = block
    ? {
        kind: AVAILABILITY_KIND_LABEL[block.kind] ?? block.kind,
        day: WEEKDAY_LABEL[block.weekday] ?? String(block.weekday),
        time: `${block.startTime}–${block.endTime}`,
        eff: effRange(block.effectiveFrom, block.effectiveTo),
      }
    : { kind: "(신규)", day: "(신규)", time: "(신규)", eff: "(신규)" };
  const after = isDelete
    ? { kind: "(삭제)", day: "(삭제)", time: "(삭제)", eff: "(삭제)" }
    : {
        kind: r.availabilityKind ? AVAILABILITY_KIND_LABEL[r.availabilityKind] ?? r.availabilityKind : "—",
        day: r.availabilityWeekday != null ? WEEKDAY_LABEL[r.availabilityWeekday] ?? String(r.availabilityWeekday) : "—",
        time: `${r.availabilityStartTime ?? "—"}–${r.availabilityEndTime ?? "—"}`,
        eff: effRange(r.availabilityEffectiveFrom, r.availabilityEffectiveTo),
      };
  const mk = (label: string, b: string, a: string): DiffRow => ({ label, before: b, after: a, changed: b !== a });
  return [
    mk("종류", before.kind, after.kind),
    mk("요일", before.day, after.day),
    mk("시간", before.time, after.time),
    mk("적용 기간", before.eff, after.eff),
  ];
}

// 요청/처리 시각 표시(로컬 ko-KR) — 표시 전용(저장 규약과 무관).
export const fmtRequestAt = (at?: string): string => {
  if (!at) return "—";
  const d = new Date(at);
  return isNaN(+d) ? at : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export type RequestStatusTone = "neutral" | "attention" | "success" | "danger";

export function requestStatusTone(status?: string): RequestStatusTone {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending") return "attention";
  return "neutral";
}

export function requestStatusHelp(status?: string, reason?: string): string {
  if (status === "approved") return "승인되어 캘린더 또는 가용시간에 반영되었습니다.";
  if (status === "rejected") return `반려되었습니다.${reason ? ` 사유: ${reason}` : ""}`;
  if (status === "pending") return "관리자 검토 대기 중입니다.";
  return "요청 상태를 확인할 수 없습니다.";
}
