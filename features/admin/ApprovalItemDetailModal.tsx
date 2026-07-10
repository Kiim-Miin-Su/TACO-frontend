'use client';
import { Badge } from '@/components/ui';
import { won } from '@/lib/format';
import { approvalDetailActionLabel, approvalDetailTitle } from '@/lib/domain/approvals';
import { categoryLabel } from '@/features/expenses/labels';
import type { Expense, SessionReport } from '@/types';
import type { PayoutRow } from '@/lib/api';

type ReportItem = { kind: 'report'; row: SessionReport };
type ExpenseItem = { kind: 'expense'; row: Expense };
type PayoutItem = { kind: 'payout'; row: PayoutRow };
export type ApprovalDetailItem = ReportItem | ExpenseItem | PayoutItem;

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-body">
      <span className="w-24 shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(+d) ? value : d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function reportStatus(row: SessionReport) {
  return row.approvalStatus ?? row.status;
}

export function ApprovalItemDetailModal({
  item,
  instructorName,
  studentName,
  sessionInfo,
  onClose,
  onApprove,
  onReject,
}: {
  item: ApprovalDetailItem;
  instructorName: (id?: number) => string;
  studentName: (id: number) => string;
  sessionInfo: (id: number) => string;
  onClose: () => void;
  onApprove: (item: ApprovalDetailItem) => void;
  onReject: (item: ApprovalDetailItem) => void;
}) {
  const id = item.row.id;
  const title = approvalDetailTitle(item.kind, id);
  const canApprove =
    (item.kind === 'report' && reportStatus(item.row) === 'submitted') ||
    (item.kind === 'expense' && item.row.status === 'requested') ||
    (item.kind === 'payout' && item.row.status === 'pending');
  const status =
    item.kind === 'report' ? reportStatus(item.row) :
    item.kind === 'expense' ? item.row.status :
    item.row.status;

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4 bg-black/35" data-testid="approval-detail-modal" onClick={onClose}>
      <div className="card card-pad w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-semibold">{title}</div>
          <Badge tone={status === 'approved' || status === 'confirmed' ? 'success' : status === 'rejected' ? 'danger' : 'attention'}>{status}</Badge>
          <button className="btn btn-sm ml-auto" onClick={onClose}>닫기</button>
        </div>

        <div className="space-y-3 min-h-0 overflow-y-auto pr-1">
          {item.kind === 'report' && (
            <>
              <section className="rounded-md border p-3 space-y-1">
                <MetaRow label="강사">{instructorName(item.row.instructorId)}</MetaRow>
                <MetaRow label="학생">{studentName(item.row.studentId)}</MetaRow>
                <MetaRow label="수업">{sessionInfo(item.row.sessionId) || `세션 #${item.row.sessionId}`}</MetaRow>
                <MetaRow label="제출 시각"><span className="mono">{formatDateTime(item.row.submittedAt)}</span></MetaRow>
                {item.row.approvedAt && <MetaRow label="승인 시각"><span className="mono">{formatDateTime(item.row.approvedAt)}</span></MetaRow>}
                {item.row.approvedBy != null && <MetaRow label="승인자">{instructorName(item.row.approvedBy)}</MetaRow>}
                {item.row.rejectedReason && <MetaRow label="반려 사유">{item.row.rejectedReason}</MetaRow>}
              </section>
              <section className="rounded-md border overflow-hidden">
                <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">보고서 내용</div>
                <div className="p-3 space-y-3">
                  <div>
                    <div className="text-caption text-fg-muted mb-1">수업 내용</div>
                    <div className="whitespace-pre-wrap text-body">{item.row.content || '—'}</div>
                  </div>
                  <div>
                    <div className="text-caption text-fg-muted mb-1">과제</div>
                    <div className="whitespace-pre-wrap text-body">{item.row.homework || '—'}</div>
                  </div>
                </div>
              </section>
            </>
          )}

          {item.kind === 'expense' && (
            <section className="rounded-md border p-3 space-y-1">
              <MetaRow label="항목">{item.row.title}</MetaRow>
              <MetaRow label="분류">{categoryLabel[item.row.category]}</MetaRow>
              <MetaRow label="금액"><span className="mono font-medium">{won(item.row.amount)}</span></MetaRow>
              <MetaRow label="지출일"><span className="mono">{item.row.spentAt}</span></MetaRow>
              <MetaRow label="거래처">{item.row.vendor ?? '—'}</MetaRow>
              <MetaRow label="메모">{item.row.memo ?? '—'}</MetaRow>
              {item.row.rejectedReason && <MetaRow label="반려 사유">{item.row.rejectedReason}</MetaRow>}
              {item.row.receiptUrl && (
                <div className="pt-2">
                  <div className="text-caption text-fg-muted mb-2">영수증</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.row.receiptUrl} alt="영수증" className="max-h-72 rounded border" />
                </div>
              )}
            </section>
          )}

          {item.kind === 'payout' && (
            <>
              <section className="rounded-md border p-3 space-y-1">
                <MetaRow label="강사">{instructorName(item.row.instructorId)}</MetaRow>
                <MetaRow label="기간"><span className="mono">{item.row.periodStart} ~ {item.row.periodEnd}</span></MetaRow>
                <MetaRow label="수업 수">{item.row.sessionCount}회 / {(item.row.totalMinutes / 60).toFixed(1)}h</MetaRow>
                <MetaRow label="자동 산정"><span className="mono">{won(item.row.computedAmount)}</span></MetaRow>
                {item.row.adjustedAmount != null && <MetaRow label="조정 금액"><span className="mono">{won(item.row.adjustedAmount)}</span></MetaRow>}
                {item.row.adjustReason && <MetaRow label="조정 사유">{item.row.adjustReason}</MetaRow>}
                <MetaRow label="승인 금액"><span className="mono font-medium">{won(item.row.amount)}</span></MetaRow>
                {item.row.rejectedReason && <MetaRow label="반려 사유">{item.row.rejectedReason}</MetaRow>}
              </section>
              <section className="rounded-md border overflow-hidden">
                <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">정산 라인</div>
                <table className="table">
                  <thead><tr><th>수업</th><th>일자</th><th className="text-right">시간</th><th className="text-right">금액</th></tr></thead>
                  <tbody>
                    {item.row.lines.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-fg-muted">정산 라인이 없습니다.</td></tr>
                    ) : item.row.lines.map((line) => (
                      <tr key={`${line.sessionId}-${line.sessionDate}`}>
                        <td>{line.courseName}</td>
                        <td className="mono text-fg-muted">{line.sessionDate}</td>
                        <td className="text-right mono">{line.durationMinutes}분</td>
                        <td className="text-right mono">{won(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>

        {canApprove && (
          <div className="flex justify-end gap-2 shrink-0 border-t pt-3">
            <button className="btn btn-sm btn-danger" onClick={() => onReject(item)}>{approvalDetailActionLabel(item.kind, 'reject')}</button>
            <button className="btn btn-sm btn-primary" onClick={() => onApprove(item)}>{approvalDetailActionLabel(item.kind, 'approve')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
