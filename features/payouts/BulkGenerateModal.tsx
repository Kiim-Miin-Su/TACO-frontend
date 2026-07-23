'use client';
// [TBO-32 C4 2026-07-22 D1] 일괄 산정 모달 — 월 선택 → 전 강사 일괄 산정(강사별 독립 tx) →
//  결과 요약(생성/건너뜀/실패 — 조용한 누락 금지) 표시. 재사용: ModalShell(§18-1)·
//  중앙 훅(useGenerateBulkPayouts)·payout-shared(monthPeriod·previousMonthYm)·won(lib/format).
import { useState } from 'react';
import { Badge, ModalShell } from '@/components/ui';
import { useGenerateBulkPayouts, useInstructors } from '@/lib/queries';
import { won } from '@/lib/format';
import { monthPeriod, previousMonthYm } from '@/features/payouts/payout-shared';
import type { BulkGenerateResult } from '@/lib/api';

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message ?? fallback;
};

export function BulkGenerateModal({ onClose }: { onClose: () => void }) {
  const bulk = useGenerateBulkPayouts();
  const { data: instructors = [] } = useInstructors();
  const [ym, setYm] = useState(previousMonthYm()); // 기본 = 전월(월말 정산 관례)
  const [result, setResult] = useState<BulkGenerateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: number) => instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`;

  function run() {
    if (bulk.isPending) return;
    setErr(null);
    const { from, to } = monthPeriod(ym);
    bulk.mutate(
      { periodStart: from, periodEnd: to },
      {
        onSuccess: setResult,
        onError: (caught) => setErr(apiErrorMessage(caught, '일괄 산정에 실패했습니다.')),
      },
    );
  }

  return (
    <ModalShell
      title="일괄 정산 산정 — 전 강사(강사별 독립 처리)"
      size="md"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>{result ? '닫기' : '취소'}</button>
          {!result && (
            <button className="btn btn-sm btn-primary" disabled={bulk.isPending} onClick={run}>
              {bulk.isPending ? '산정 중…' : '산정 실행'}
            </button>
          )}
        </>
      )}
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Badge tone="success">생성 {result.generated.length}</Badge>
            <Badge tone="neutral">건너뜀 {result.skipped.length}</Badge>
            <Badge tone={result.failed.length ? 'danger' : 'neutral'}>실패 {result.failed.length}</Badge>
          </div>
          {result.generated.length > 0 && (
            <ul className="space-y-1 text-body">
              {result.generated.map((g) => (
                <li key={g.payoutId} className="flex items-center gap-2">
                  <span className="font-medium">{nameOf(g.instructorId)}</span>
                  <span className="text-fg-muted">{g.sessionCount}회</span>
                  <span className="mono ml-auto">{won(g.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <p className="text-caption text-fg-subtle">
              건너뜀: {result.skipped.map((skip) => nameOf(skip.instructorId)).join(', ')} — 적격 세션 없음(이미 정산됐거나 보고서 미승인).
            </p>
          )}
          {result.failed.length > 0 && (
            <div className="text-caption text-danger" role="alert">
              실패: {result.failed.map((f) => `${nameOf(f.instructorId)}(${f.error})`).join(' · ')}
            </div>
          )}
          <p className="text-caption text-fg-subtle">생성된 정산서는 승인 대기 상태입니다 — 목록에서 확정·지급을 진행하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-caption text-fg-subtle">산정 월 (1일~말일)</span>
            <input type="month" className="input w-full mt-1" value={ym} onChange={(e) => setYm(e.target.value)} data-modal-autofocus="true" />
          </label>
          <p className="text-caption text-fg-subtle">
            활성 강사 전원을 대상으로 강사별 독립 산정합니다 — 한 강사의 실패가 다른 강사의 생성을 막지 않고,
            이미 정산된 수업은 다시 계상되지 않습니다(이중 계상 방지). 결과 요약이 바로 표시됩니다.
          </p>
          {err && <p className="text-caption text-danger" role="alert">{err}</p>}
        </div>
      )}
    </ModalShell>
  );
}
