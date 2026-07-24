'use client';
// [TBO-60 2026-07-24] 대표 대시보드 6종 — 서버 파생(ceoDashboard 한 쿼리 + 기존 파생) 소비만.
//  D1 재무 요약(financeSummary — C4 확정 갭 '서버 파생 미소비' 해소) · D2 미수금 aging ·
//  D3 수강생 증감 · D6 코스 수익성 = GraphQL ceoDashboard(REPEATABLE READ 한 스냅샷).
//  D4 상담 전환 = 상담 분석 화면(기존 counselFunnel) 링크 · D5 강사 가동률 = 기존
//  InstructorAttendanceSummary(출결 요약 위젯) 재사용. 클라 조인 신설 0(FABLE §4.5).
import { useState } from 'react';
import Link from 'next/link';
import { EmptyState, LoadingState, SectionCard, StatCard, TableWrap } from '@/components/ui';
import { won } from '@/lib/format';
import { useCeoDashboard } from '@/lib/queries';
import { monthPeriod } from '@/features/payouts/payout-shared';
import { InstructorAttendanceSummary } from './InstructorAttendanceSummary';

export function CeoDashboards() {
  const [{ from: defFrom, to: defTo }] = useState(() => monthPeriod());
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(defTo);
  const dash = useCeoDashboard({ from, to });
  const data = dash.data;

  return (
    <div className="space-y-6">
      <SectionCard
        title="대표 대시보드 (기간 선택)"
        action={
          <span className="inline-flex items-center gap-2">
            <input type="date" aria-label="시작일" className="input h-8" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-fg-subtle">~</span>
            <input type="date" aria-label="종료일" className="input h-8" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        }
      >
        {dash.isPending ? (
          <LoadingState />
        ) : !data ? (
          <EmptyState message="집계를 불러오지 못했습니다." />
        ) : (
          <div className="p-4 space-y-6">
            {/* D1 — 재무 요약(서버 파생 financeSummary 소비) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="매출(실현)" value={won(data.finance.revenue)} tone="success" />
              <StatCard label="지출(승인)" value={won(data.finance.expenses)} tone="attention" />
              <StatCard label="강사 정산(지급)" value={won(data.finance.payouts)} tone="attention" />
              <StatCard label="순이익" value={won(data.finance.net)} tone={data.finance.net >= 0 ? 'accent' : 'danger'} sub="매출 − 지출 − 정산" />
            </div>

            {/* D2 — 미수금 aging */}
            <div>
              <h3 className="text-body font-semibold mb-2">미수금 — 얼마나 오래 못 받았나</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {data.receivables.map((bucket) => (
                  <StatCard
                    key={bucket.bucket}
                    label={`연체 ${bucket.bucket}`}
                    value={won(bucket.amount)}
                    tone={bucket.bucket === '90일+' && bucket.amount > 0 ? 'danger' : bucket.amount > 0 ? 'attention' : undefined}
                    sub={`${bucket.count}건`}
                  />
                ))}
              </div>
            </div>

            {/* D3 — 수강생 증감 */}
            <div>
              <h3 className="text-body font-semibold mb-2">수강생 증감 — 늘고 있나</h3>
              {data.enrollmentTrend.length === 0 ? (
                <p className="text-caption text-fg-subtle">기간 내 수강 시작·종료가 없습니다.</p>
              ) : (
                <TableWrap minWidth={420}>
                  <table className="table">
                    <thead><tr><th>월</th><th className="text-right">신규</th><th className="text-right">종료</th><th className="text-right">순증</th></tr></thead>
                    <tbody>
                      {data.enrollmentTrend.map((row) => (
                        <tr key={row.month}>
                          <td className="mono">{row.month}</td>
                          <td className="text-right mono">+{row.started}</td>
                          <td className="text-right mono">−{row.ended}</td>
                          <td className={`text-right mono font-medium ${row.net >= 0 ? 'text-success' : 'text-danger'}`}>{row.net >= 0 ? `+${row.net}` : row.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>

            {/* D6 — 코스 수익성 */}
            <div>
              <h3 className="text-body font-semibold mb-2">코스 수익성 — 어떤 수업이 남는 장사인가</h3>
              {data.courseProfit.length === 0 ? (
                <p className="text-caption text-fg-subtle">기간 내 실현 수납·정산이 코스에 귀속되지 않았습니다.</p>
              ) : (
                <TableWrap minWidth={520}>
                  <table className="table">
                    <thead><tr><th>수업</th><th className="text-right">매출</th><th className="text-right">강사 비용</th><th className="text-right">이익</th></tr></thead>
                    <tbody>
                      {data.courseProfit.map((row) => (
                        <tr key={row.courseId}>
                          <td className="font-medium">{row.courseName}</td>
                          <td className="text-right mono">{won(row.revenue)}</td>
                          <td className="text-right mono">{won(row.cost)}</td>
                          <td className={`text-right mono font-medium ${row.profit >= 0 ? 'text-success' : 'text-danger'}`}>{won(row.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <p className="text-caption text-fg-subtle mt-1">매출=기간 내 실현 수납(수강 귀속) · 비용=확정·지급 정산의 회차 금액. 미귀속 수납은 재무 요약에만 포함.</p>
            </div>

            {/* D4 — 상담 전환(기존 분석 화면 링크) */}
            <p className="text-caption text-fg-muted">
              상담 → 등록 전환 분석(D4)은 <Link href="/counsel/analytics" className="underline">상담 분석</Link>에서 —
              같은 기간 파라미터로 서버 파생(counselFunnel)을 소비합니다.
            </p>
          </div>
        )}
      </SectionCard>

      {/* D5 — 강사 가동률(기존 출결 요약 위젯 재사용 — 시수·출석률·인정 시수) */}
      <SectionCard title="강사 가동률 (시수·출석률)">
        <InstructorAttendanceSummary />
      </SectionCard>
    </div>
  );
}
