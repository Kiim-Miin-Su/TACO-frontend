'use client';
import Link from 'next/link';
import { Badge, SectionCard, PageHeader, EmptyState, TableWrap } from '@/components/ui';
// 서버 상태(상담 폼·회차)는 TanStack Query 훅에서 구독한다(zustand store 대체).
import { useCounselForms, useCounselRounds } from '@/lib/queries';
import { CounselForm } from './CounselForm';
import { CounselCalendar } from './CounselCalendar';
import { statusLabel, statusTone, sourceLabel } from './labels';

export function CounselView() {
  const { data: forms = [] } = useCounselForms();
  const { data: rounds = [] } = useCounselRounds();
  const roundCount = (formId: number) => rounds.filter((r) => r.counselFormId === formId).length;

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader title="상담" sub="상담 신청 · 예약/내역 캘린더 · 상담카드 관리" />

      <CounselCalendar />

      <SectionCard title="상담 신청 (학생·학부모 또는 상담실장 작성)">
        <CounselForm />
      </SectionCard>

      <SectionCard title={`상담카드 목록 (${forms.length})`}>
        {forms.length === 0 ? (
          <EmptyState message="접수된 상담카드가 없습니다. 위 양식으로 상담을 신청하세요." />
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
              {forms.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="font-medium">{f.applicantName}</div>
                    <div className="text-caption text-fg-subtle">{f.applicantPhone ?? ''}</div>
                  </td>
                  <td className="text-fg-muted">{sourceLabel[f.source]}</td>
                  <td><Badge tone={statusTone[f.status]}>{statusLabel[f.status]}</Badge></td>
                  <td className="mono">{roundCount(f.id)}회</td>
                  <td className="mono text-fg-muted">{f.nextContactAt ?? '—'}</td>
                  <td className="mono text-fg-muted">{f.createdAt}</td>
                  <td className="text-right">
                    <Link href={`/counsel/${f.id}`} className="btn btn-sm">열기 · 수정</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
