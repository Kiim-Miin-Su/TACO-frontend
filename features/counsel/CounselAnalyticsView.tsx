'use client';
// [TBO-30D/30E 2026-07-23 대표 지시] 상담 퍼널·상담↔수강 상관관계 화면.
//  재사용(단일 진실원): 수치 = 서버 순수 함수 파생(useCounselFunnel/useCounselCorrelation —
//  전 목록 클라 계산 금지) · 표시 파생 = analytics-shared(pct·프리셋·단계 조립) ·
//  라벨/톤 = labels.ts(상담 화면 공통) · UI = PageHeader/StatCard/SectionCard/Chart/TableWrap/Badge.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ChartConfiguration } from 'chart.js';
import { Badge, Chart, EmptyState, LoadingState, PageHeader, SectionCard, StatCard, TableWrap } from '@/components/ui';
import { useCounselFunnel, useCounselCorrelation } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { resultLabel, resultTone, statusLabel, statusTone, STATUSES, RESULTS } from './labels';
import { analyticsRangePresets, funnelStages, pct } from './analytics-shared';

export function CounselAnalyticsView() {
  const canManage = useAccountAccess().can('counsel.manage');
  const presets = useMemo(() => analyticsRangePresets(), []);
  const [presetKey, setPresetKey] = useState('3m');
  const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
  const funnelQ = useCounselFunnel({ from: preset.from, to: preset.to });
  const correlationQ = useCounselCorrelation({ from: preset.from, to: preset.to });
  const funnel = funnelQ.data;
  const correlation = correlationQ.data;

  if (!canManage) {
    return (
      <div className="p-6 max-w-page mx-auto">
        <PageHeader title="상담 분석" />
        <EmptyState message="상담 분석은 관리 역할만 조회할 수 있습니다." />
      </div>
    );
  }

  const stages = funnel ? funnelStages(funnel) : [];
  const stageCfg: ChartConfiguration | null = funnel ? {
    type: 'bar',
    data: {
      labels: stages.map((stage) => stage.label),
      datasets: [{ label: '상담 카드', data: stages.map((stage) => stage.count), backgroundColor: ['#1c7293', '#2563eb', '#8250df', '#0f9d6b'], borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { precision: 0 } } },
    },
  } : null;

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <div>
        <Link href="/counsel" className="text-caption text-fg-muted hover:underline">← 상담</Link>
        <PageHeader
          title="상담 분석 — 퍼널 · 수강 상관관계"
          sub="집계는 서버 파생(원본 무변형) · 희망 과목=학생 관심 SSOT · 등록=수강 SSOT 조인"
          actions={
            <div className="flex gap-1">
              {presets.map((p) => (
                <button key={p.key} type="button"
                  className={`btn btn-sm ${p.key === presetKey ? 'btn-primary' : ''}`}
                  onClick={() => setPresetKey(p.key)}>{p.label}</button>
              ))}
            </div>
          }
        />
      </div>

      {funnelQ.isPending ? <LoadingState /> : funnelQ.isError ? (
        <EmptyState message="상담 분석 데이터를 불러오지 못했습니다." />
      ) : funnel && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="접수" value={`${funnel.total}건`} />
            <StatCard label="등록 전환율" value={pct(funnel.conversionRate)} tone="success" />
            <StatCard label="미등록률" value={pct(funnel.dropRate)} tone={funnel.dropRate > 0 ? 'danger' : undefined} />
            <StatCard label="평균 전환 회차" value={funnel.avgRoundsToConversion != null ? `${funnel.avgRoundsToConversion}회차` : '—'} tone="accent" />
            <StatCard label="평균 전환 소요" value={funnel.avgDaysToConversion != null ? `${funnel.avgDaysToConversion}일` : '—'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="퍼널 — 접수 → 회차 진행 → 등록 전환">
              <div className="p-4 space-y-3">
                {stageCfg && <Chart config={stageCfg} height={200} />}
                <ul className="space-y-1 text-body">
                  {stages.map((stage) => (
                    <li key={stage.key} className="flex items-center gap-2">
                      <span className="w-24 text-fg-muted">{stage.label}</span>
                      <span className="font-medium">{stage.count}건</span>
                      <span className="text-caption text-fg-subtle">({pct(stage.rate)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>

            <SectionCard title="상태 · 회차 결과 분포">
              <div className="p-4 space-y-3 text-body">
                <div className="flex items-center gap-2 flex-wrap">
                  {STATUSES.map((status) => (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                      <span className="mono">{funnel.statusCounts[status]}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap border-t border-line-muted pt-3">
                  {RESULTS.map((result) => (
                    <span key={result} className="inline-flex items-center gap-1.5">
                      <Badge tone={resultTone[result]}>{resultLabel[result]}</Badge>
                      <span className="mono">{funnel.resultDistribution[result]}</span>
                    </span>
                  ))}
                </div>
                <div className="border-t border-line-muted pt-3">
                  <div className="text-caption text-fg-subtle mb-1">미등록 카드가 멈춘 회차 — 어디서 놓치는가</div>
                  {funnel.dropAfterRounds.length === 0 ? (
                    <span className="text-fg-subtle">이탈 없음</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {funnel.dropAfterRounds.map((row) => (
                        <li key={row.rounds}>
                          <span className="font-medium">{row.rounds === 0 ? '접수만(0회차)' : `${row.rounds}회차 후`}</span>
                          <span className="text-fg-muted"> — {row.count}건</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard title="상담 희망 과목 × 실제 등록 과목 (전환 상관관계)">
        {correlationQ.isPending ? <LoadingState /> : correlationQ.isError ? (
          <EmptyState message="상관관계 데이터를 불러오지 못했습니다." />
        ) : !correlation || correlation.rows.length === 0 ? (
          <EmptyState message="기간 내 상담 카드가 없습니다." />
        ) : (
          <TableWrap minWidth={640}>
            <table className="table">
              <thead>
                <tr>
                  <th>희망 과목(관심 SSOT)</th><th className="text-right">상담</th><th className="text-right">전환</th><th className="text-right">전환율</th>
                  <th>실제 등록 과목(수강 SSOT)</th>
                </tr>
              </thead>
              <tbody>
                {correlation.rows.map((row) => (
                  <tr key={row.interestKey}>
                    <td className="font-medium">{row.interestKey}</td>
                    <td className="text-right mono">{row.counselCount}</td>
                    <td className="text-right mono">{row.convertedCount}</td>
                    <td className="text-right mono">{pct(row.conversionRate)}</td>
                    <td>
                      {row.enrolledBySubject.length === 0 ? <span className="text-fg-subtle">—</span> : (
                        <span className="flex gap-1.5 flex-wrap">
                          {row.enrolledBySubject.map((cell) => (
                            <Badge key={cell.subject} tone={cell.subject === row.interestKey ? 'success' : 'attention'}>
                              {cell.subject} {cell.count}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="px-4 pb-3 text-caption text-fg-subtle">
          희망과 다른 과목 배지(노랑)는 교차 전환 — 예: SAT 문의가 TOEFL 등록으로 이어진 경우. 취소된 수강은 제외됩니다.
        </p>
      </SectionCard>
    </div>
  );
}
