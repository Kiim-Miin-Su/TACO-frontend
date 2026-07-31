'use client';
// [TBO-80 80G = TBO-79 O13 대표 결정 "내 정산 화면 신설"] 강사 전용 읽기 화면.
//
//  배경: TBO-73A가 강사에게 정산 UI를 비노출로 바꾸며 `GET /payouts/me`는 보존했는데,
//  lib/tasks.ts는 강사에게 /payouts 배지·할일(반려/회수·단가 미설정 안내)을 계속 만들었다 —
//  볼 수 없는 화면으로 안내하는 반쪽 배선(TBO-79 O13). 이 화면이 그 링크의 실제 도착지다.
//
//  경계: 본인 정산만(서버 instructor.self 스코프 — useMyPayouts). 명령 버튼 0(생성·승인·조정·지급·
//  회수는 대표 전용 — 여기서 재구현하지 않는다). 표시 어휘는 payout-shared 단일 진실원.
import { EmptyState, PageHeader, SectionCard, Badge, TableWrap } from '@/components/ui';
import { useMyPayouts } from '@/lib/queries';
import { won, dateOnly } from '@/lib/format';
import { payoutDisplayStatus, payoutHours, isReversedPayout } from '@/features/payouts/payout-shared';

export function MyPayoutsView() {
  const { data: rows = [], isLoading, isError } = useMyPayouts();

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="내 정산"
        sub="본인 정산 내역(읽기 전용) — 산정·승인·지급은 대표가 처리하며, 문의는 대표에게 남겨 주세요."
      />
      {isError ? (
        <EmptyState message="정산 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />
      ) : isLoading ? (
        <EmptyState message="정산 내역을 불러오는 중…" />
      ) : rows.length === 0 ? (
        <EmptyState message="아직 생성된 정산이 없습니다. 정산은 대표가 기간 단위로 산정합니다." />
      ) : (
        <SectionCard title={`정산 내역 (${rows.length})`}>
          <TableWrap minWidth={720}>
            <table className="table">
              <thead>
                <tr><th>기간</th><th>상태</th><th className="text-right">시수</th><th className="text-right">지급액</th><th>지급일</th><th>사유</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = payoutDisplayStatus(row);
                  return (
                    <tr key={row.id}>
                      <td className="mono whitespace-nowrap">{row.periodStart} ~ {row.periodEnd}</td>
                      <td><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="text-right mono">{payoutHours(row.totalMinutes)}</td>
                      <td className="text-right mono">{won(row.amount)}</td>
                      <td className="mono text-fg-muted whitespace-nowrap">{row.paidAt ? dateOnly(row.paidAt) : '—'}</td>
                      <td className="text-caption text-fg-muted">
                        {isReversedPayout(row) ? (row.reversedReason ?? '지급 회수') : row.rejectedReason ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <p className="px-4 py-3 text-caption text-fg-subtle">
            반려·회수된 정산은 사유와 함께 표시됩니다. 회차별 상세 근거는 수업 보고서·출석부에서 확인할 수 있습니다.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
