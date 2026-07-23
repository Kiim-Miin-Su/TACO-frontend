'use client';
// [TBO-46 G2 2026-07-23] 매출 분석 — GraphQL 서버 파생(revenueReport) 소비로 전환.
//  종전: payments·enrollments·courses·subjects·students **전 목록 5개**를 내려받아 브라우저에서
//  조인·집계(클라 계산). 이제 서버 순수 함수(revenue-analytics — 단일 진실원)가 파생한 결과 1쿼리만
//  소비한다. 실현 매출은 paidAmount??amount로 통일(종전 이 화면 amount vs 학생 상세 paidAmount
//  불일치 해소 — TBO-46 §5). 차트·기간 UI는 기존 그대로 재사용.
import { useState } from 'react';
import { Chart, EmptyState, LoadingState, SectionCard } from '@/components/ui';
import { useRevenueReport } from '@/lib/queries';
import { won } from '@/lib/format';
import type { ChartConfiguration } from 'chart.js';

const PALETTE = ['#0f766e', '#2563eb', '#e08a00', '#8250df', '#0f9d6b', '#cf222e', '#1c7293'];
const wonTick = (v: number | string) => `₩${Number(v).toLocaleString('ko-KR')}`;

export function RevenueCharts() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState('2026-05-01');
  const [end, setEnd] = useState('2026-06-30');
  const { data: report, isPending, isError } = useRevenueReport({ from: start, to: end });

  if (isPending) return <LoadingState />;
  if (isError || !report) return <EmptyState message="매출 데이터를 불러오지 못했습니다." />;

  const periodCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: report.byMonth.map((x) => x.key), datasets: [{ label: '매출', data: report.byMonth.map((x) => x.amount), backgroundColor: '#0f766e', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };
  const studentCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: report.byStudent.map((x) => x.key), datasets: [{ label: '매출', data: report.byStudent.map((x) => x.amount), backgroundColor: '#2563eb', borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };
  const subjectCfg: ChartConfiguration = {
    type: 'doughnut',
    data: { labels: report.bySubject.map((x) => x.key), datasets: [{ data: report.bySubject.map((x) => x.amount), backgroundColor: PALETTE }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
  };
  const courseCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: report.byCourse.map((x) => x.key), datasets: [{ label: '매출', data: report.byCourse.map((x) => x.amount), backgroundColor: '#e08a00', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={`매출 분석 (실현 매출 ${won(report.realizedTotal)}${report.unpaidCount ? ` · 미납 ${report.unpaidCount}건 ${won(report.unpaidTotal)}` : ''})`}
        action={
          <div className="flex items-center gap-1.5">
            <input aria-label="조회 시작일" type="date" className="input h-7 w-36" max={today} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-fg-subtle">~</span>
            <input aria-label="조회 종료일" type="date" className="input h-7 w-36" max={today} min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        }
      >
        <div className="p-4"><Chart config={periodCfg} height={240} /></div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="인당 매출 순위"><div className="p-4"><Chart config={studentCfg} height={240} /></div></SectionCard>
        <SectionCard title="과목별 매출"><div className="p-4"><Chart config={subjectCfg} height={240} /></div></SectionCard>
      </div>
      <SectionCard title="수업(코스)별 매출"><div className="p-4"><Chart config={courseCfg} height={240} /></div></SectionCard>
    </div>
  );
}
