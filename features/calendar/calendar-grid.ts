// [TBO-69 C4 2026-07-26] 캘린더 그리드 상수·순수 헬퍼·상호작용 타입 — ScheduleCalendar(2,853줄)
//  모듈 스코프 블록 분리(본문 이동 — 값·산식 무변). 재사용 단위: 그리드 좌표(분↔px)·스냅·축 클램프·
//  시차 셀→KST 변환·취소 시각화 술어를 다른 캘린더 표면(월간·프린트 등)이 같은 정본으로 소비 가능.
//  [단일 진실화 2건] todayISO = lib/format.todayKst 소비(**UTC 사본 소탕 — TBO-65 M2 잔여**:
//  자정~09시 KST 하루 어긋남이 캘린더 anchor에 남아 있었다) · addDaysISO = lib/format 정본.
import type { ReactNode } from "react";
import type { ScheduleRow } from "@/types";
import type { SchedulePatchBody, AvailabilityUpsertBody } from "@/lib/api";
import { toMin, fromMin, weekdayOf, sessionEndMin } from "@/lib/domain/schedule";
import { PALETTE, type SplitDim } from "@/lib/domain/lantiv";
import { KST_TZ, tzLocalToKst } from "@/lib/domain/tz";
import { addDaysISO, todayKst } from "@/lib/format";
import type { SessionAccountingImpact } from "@kms545487/contracts";

// ── 그리드 상수 (애플/구글 캘린더 스타일: 넓고 시간 단위가 또렷하게) ──
export const START_H = 0,
  END_H = 24,
  HOUR_H = 46, // 시간당 높이(px) — 세로로 너무 길지 않게 압축(한눈에 들어오도록)
  SNAP = 15;
export const HEADER_H = 52; // 요일/강의실 헤더 높이
export const GUTTER_W = 64; // 시간 거터 너비
export const GRID_MIN = START_H * 60;
// WD/toMin/fromMin/pad는 lib/domain/schedule, PALETTE/STATUS_LABEL은 lib/domain/lantiv에서 import(단일 소스).
// 시수 미측정·충돌 제외·회색 표시 대상(결강/취소)
export const CANCELED_GRAY = "#8c959f";
export const INSTRUCTOR_RESOURCE_FILTER_DIMS: "room"[] = ["room"];
export const INSTRUCTOR_SPLIT_DIMS: SplitDim[] = ["room", "subject"];
export const INSTRUCTOR_RESOURCE_PANEL_TYPES: "room"[] = ["room"];
export const isCanceledStatus = (s?: string) => s === "canceled" || s === "no_show";
// [TBO-19] 강사 결석(instructorAttendance='absent')도 '결강'처럼 시각화(회색·취소선) — status는 바꾸지 않고 표시만.
//  (결석 시수 제외는 백엔드 payouts.measure가 담당. 여기선 캘린더 렌더만.)
export const isSessionCanceled = (r: { status?: string; instructorAttendance?: string | null }) =>
  isCanceledStatus(r.status) || r.instructorAttendance === "absent";

export const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;

// [R-1b 2026-07-06] F3: kstPatchTimes는 lib/domain/tz로 이동(순수 함수·vitest 회귀) —
//  자정 크로스 클램프 endTime('24:00')·무효값('24:05')이 저장 패치로 새지 않도록 방어 추가.

// [이슈2] 시차 그리드 셀 좌표(현지 날짜 + 현지 분) → KST {date, startMin}. 드래그·리사이즈·붙여넣기가
//  시차 뷰에서도 올바른 KST로 저장되도록 변환. tz 없으면(KST 컬럼) 그대로.
export function tzCellToKst(dateLocal: string, localMin: number, tz?: string | null): { date: string; startMin: number } {
  if (!tz || tz === KST_TZ) return { date: dateLocal, startMin: localMin };
  const k = tzLocalToKst(dateLocal, fromMin(localMin), tz);
  return { date: k.date, startMin: toMin(k.time) };
}
// 축 경계로 분 클램프(단일 소스 — KST 8~22 / 시차 0~24 등 축마다 min·max만 다름). [최적화: 중복 클램프 통일]
export const clampToAxis = (mm: number, min: number, max: number) => Math.max(min, Math.min(max, mm));
export const clampMin = (mm: number) => clampToAxis(mm, GRID_MIN, END_H * 60); // KST 기본 축
export const todayISO = () => todayKst(); // [TBO-69 C4] KST 진실원(lib/format) — UTC 사본 소탕(M2 잔여)
// [TBO-69 C4] addDaysISO — lib/format 정본 소비(사본 제거)
// 해당 날짜가 속한 주의 월요일
export const mondayOf = (iso: string) => addDaysISO(iso, weekdayOf(iso) === 0 ? -6 : 1 - weekdayOf(iso));
export const hashColor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export const startMinOf = (r: ScheduleRow) => toMin(r.startTime ?? "09:00");
// [R-9] 자정 크로스(endTime 미저장·durationMinutes 파생) 대응 — 1440 초과 가능(단일 소스: sessionEndMin)
export const endMinOf = (r: ScheduleRow) => sessionEndMin({ startTime: r.startTime ?? "09:00", endTime: r.endTime, durationMinutes: r.durationMinutes });

export type View = "month" | "week" | "day";
export type ColorBy = "subject" | "instructor" | "room" | "student";
export type ManualPaneState = { uid: number; dim: SplitDim; ids: number[] };
export type Resizing = { id: number; edge: "top" | "bottom"; startClientY: number; origStart: number; origEnd: number;
  gm: number; gmax: number; tz?: string; dateLocal: string }; // [이슈2] 시차 뷰 리사이즈: 축 경계·tz·현지날짜
export type Pending = { row: ScheduleRow; patch: SchedulePatchBody; label: string };
export type AccountingImpact = SessionAccountingImpact;
export type AccountingAck = { id: number; patch: SchedulePatchBody; impact: AccountingImpact; payoutLocked: boolean };
// 승인 요청 드래프트 타입은 modals/ApprovalRequestModals(모달과의 계약)에서 import — 여기선 seed만 정의.
// [B6 C1] window.confirm 대체 — 확인 요청을 상태로 보관하고 ConfirmModal 하나로 렌더(충돌 강행·삭제 확인).
export type ConfirmRequest = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void> };
export type AvailabilityApprovalSeed =
  | { action: "upsert"; body: AvailabilityUpsertBody; summary: string }
  | { action: "delete"; targetAvailabilityId: number; summary: string };
