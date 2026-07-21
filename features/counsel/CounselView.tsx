'use client';
// [IA 3분할 2026-07-07] 상담 허브 — 탭 [목록 | 예약 캘린더]. 신청 폼은 별도 페이지(/counsel/new).
//  종전엔 한 페이지에 캘린더+폼+목록이 쌓여 가독성이 낮았음 → 목록(검색)·예약(캘린더)·폼(페이지)으로 분리.
import { useState } from 'react';
import Link from 'next/link';
import { Badge, ClickableTableRow, SectionCard, PageHeader, EmptyState, LoadingState, TableWrap } from '@/components/ui';
// 서버 상태(상담 폼·회차)는 TanStack Query 훅에서 구독한다(zustand store 대체).
import { useCounselForms, useCounselRounds } from '@/lib/queries';
import { CounselCalendar } from './CounselCalendar';
import { recentCounselForms } from '@/lib/domain/counsel';
import { statusLabel, statusTone, sourceLabel } from './labels';

type Tab = 'list' | 'calendar';

export function CounselView() {
  // [B6 C3 2026-07-16] isPending 구독 — 로드 중 "접수된 상담카드가 없습니다" 깜빡임 방지(E0.6 H2 규칙).
  const { data: forms = [], isPending: loading } = useCounselForms();
  const { data: rounds = [] } = useCounselRounds();
  const roundCount = (formId: number) => rounds.filter((r) => r.counselFormId === formId).length;

  const [tab, setTab] = useState<Tab>('list');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const recentForms = recentCounselForms(forms);
  const filtered = needle
    ? recentForms.filter((f) => `${f.applicantName} ${f.applicantPhone ?? ''}`.toLowerCase().includes(needle))
    : recentForms;

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="상담"
        sub="최근 접수순 상담카드 · 예약 캘린더 · 신청"
        actions={<Link href="/counsel/new" className="btn btn-primary">+ 상담 신청</Link>}
      />

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line">
        {([['list', '목록'], ['calendar', '예약 캘린더']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 h-9 text-body -mb-px border-b-2 transition-colors ${
              tab === k ? 'border-accent font-semibold text-fg' : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <CounselCalendar />
      ) : (
        <SectionCard
          title={`상담카드 (${filtered.length}${needle ? ` / ${forms.length}` : ''})`}
          action={
            <input
              className="input h-8 w-56 text-caption"
              placeholder="이름·연락처 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          }
        >
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState message={needle ? '검색 결과가 없습니다.' : '접수된 상담카드가 없습니다. 우측 상단 “+ 상담 신청”으로 시작하세요.'} />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>신청자</th>
                    <th>유입</th>
                    <th>상태</th>
                    <th>회차</th>
                    <th>다음 상담</th>
                    <th>접수일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <ClickableTableRow
                      key={f.id}
                      href={`/counsel/${f.id}`}
                      label={`${f.applicantName} 상담 상세 보기`}
                    >
                      <td>
                        <Link href={`/counsel/${f.id}`} className="font-medium text-accent hover:underline">{f.applicantName}</Link>
                        <div className="text-caption text-fg-subtle">{f.applicantPhone ?? ''}</div>
                      </td>
                      <td className="text-fg-muted">{sourceLabel[f.source]}</td>
                      <td><Badge tone={statusTone[f.status]}>{statusLabel[f.status]}</Badge></td>
                      <td className="mono">{roundCount(f.id)}회</td>
                      <td className="mono text-fg-muted">{f.nextContactAt ?? '—'}</td>
                      <td className="mono text-fg-muted">{f.createdAt}</td>
                      <td className="text-right">
                        <Link href={`/counsel/${f.id}`} className="btn btn-sm">상세 보기</Link>
                      </td>
                    </ClickableTableRow>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </SectionCard>
      )}
    </div>
  );
}
