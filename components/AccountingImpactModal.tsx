"use client";
import { ConfirmModal } from '@/components/ui';
import type { AccountingImpactPrompt } from '@/lib/queries';

export function AccountingImpactModal({ prompt, onClose, onConfirm }: {
  prompt: AccountingImpactPrompt | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!prompt) return null;
  const { impact } = prompt;
  return (
    <ConfirmModal
      title={prompt.payoutLocked ? '정산 회수가 필요한 수업' : '시수·정산 변경 확인'}
      confirmLabel={prompt.payoutLocked ? '확인' : '변경 적용'}
      danger
      message={
        <div className="space-y-2">
          <p>인정 시수 {impact.before.teachingMinutes}분 → {impact.after.teachingMinutes}분 ({impact.delta.teachingMinutes >= 0 ? '+' : ''}{impact.delta.teachingMinutes}분)</p>
          <p>예상 정산액 {impact.before.computedAmount.toLocaleString('ko-KR')}원 → {impact.after.computedAmount.toLocaleString('ko-KR')}원 ({impact.delta.computedAmount >= 0 ? '+' : ''}{impact.delta.computedAmount.toLocaleString('ko-KR')}원)</p>
          {prompt.payoutLocked && <p className="text-danger">이미 정산서에 포함되어 있습니다. 원장 무결성을 위해 정산 회수 또는 보정 거래가 먼저 필요합니다.</p>}
        </div>
      }
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
