// [TBO-65 P2 FE-4 2026-07-26] 리포트 승인 상태 표기 단일 진실원 — 종전 3곳 3표기
//  (ReportDetailView '승인됨 · 시수 반영' / 워크시트 '승인' / 피드백 폼 뱃지)가 각자 정의해 드리프트.
import type { Tone } from '@/components/ui';

export const REPORT_APPROVAL_LABEL: Record<string, { label: string; tone: Tone }> = {
  approved: { label: '승인됨 · 시수 반영', tone: 'success' },
  submitted: { label: '승인 대기', tone: 'accent' },
  rejected: { label: '반려', tone: 'danger' },
  draft: { label: '작성중', tone: 'neutral' },
};
export const reportApprovalBadge = (approval: string | null | undefined) =>
  REPORT_APPROVAL_LABEL[approval ?? 'draft'] ?? { label: approval ?? '미작성', tone: 'neutral' as Tone };
