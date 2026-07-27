'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { Badge, EmptyState, LoadingState, PageHeader, SectionCard, StatCard, TableWrap } from '@/components/ui';
import { reportApprovalBadge } from '@/lib/domain/reports';
import { useInstructors, usePayouts, usePayoutWorksheet } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { won } from '@/lib/format';
import { internalRoute } from '@/lib/navigation-security';
import { payoutHours as hours, monthPeriod } from '@/features/payouts/payout-shared';
import { PayoutStatusBadge } from '@/features/payouts/PayoutStatusBadge';
import { PayoutWorksheetAmountCell } from '@/features/payouts/PayoutWorksheet';
import { groupPayoutWorksheetRows } from '@/features/payouts/payout-worksheet-groups';

const thisYm = () => new Date().toISOString().slice(0, 7);

const attendanceLabel = (value: string | null) => {
  if (value === 'present') return '출석';
  if (value === 'late') return '지각';
  if (value === 'absent') return '결석';
  if (value === 'excused') return '인정';
  return '미기록';
};

export function PayoutDetailView({ instructorId }: { instructorId: number }) {
  const access = useAccountAccess();
  if (!access.can('payout.worksheet')) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title="강사 시수 상세" sub="매니저 이상만 열람할 수 있습니다." />
        <EmptyState message="이 계정에는 강사 시수 상세 권한이 없습니다." />
      </div>
    );
  }
  return <AuthorizedPayoutDetail instructorId={instructorId} />;
}

function AuthorizedPayoutDetail({ instructorId }: { instructorId: number }) {
  const access = useAccountAccess();
  const finance = access.can('finance.access');
  const { data: instructors = [], isPending: loadingInstructors } = useInstructors();
  const { data: allPayouts = [] } = usePayouts();
  const [ym, setYm] = useState(thisYm());
  const range = monthPeriod(ym);
  const worksheet = usePayoutWorksheet(instructorId, range.from, range.to);
  const groups = useMemo(
    () => groupPayoutWorksheetRows(worksheet.data?.rows ?? []),
    [worksheet.data?.rows],
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const instructor = instructors.find((item) => item.id === instructorId);
  const myPayouts = useMemo(
    () => allPayouts
      .filter((payout) => payout.instructorId === instructorId)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
    [allPayouts, instructorId],
  );

  const navMonth = (delta: number) => {
    const [year, month] = ym.split('-').map(Number);
    setYm(new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7));
  };
  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  if (!loadingInstructors && !instructor) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <Link href="/payouts" className="text-caption text-fg-muted hover:underline">강사 시수로</Link>
        <PageHeader title="강사 시수 상세" sub={`강사(id ${instructorId})를 찾을 수 없습니다.`} />
      </div>
    );
  }

  const totals = worksheet.data?.totals;
  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <div>
        <Link href="/payouts" className="text-caption text-fg-muted hover:underline">강사 시수로</Link>
        <PageHeader
          title={`${instructor?.name ?? `강사 #${instructorId}`} 시수 상세`}
          sub="과목과 수업별 회차, 출결, 리포트, 책정 금액을 DB 기준으로 확인합니다."
          actions={
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn btn-sm" onClick={() => navMonth(-1)} aria-label="이전 달">◀</button>
              <span className="mono text-body w-[70px] text-center">{ym}</span>
              <button type="button" className="btn btn-sm" onClick={() => navMonth(1)} aria-label="다음 달">▶</button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="수업" value={`${groups.length}개`} />
        <StatCard label="전체 회차" value={`${totals?.sessionCount ?? 0}회`} />
        <StatCard label="산정 시수" value={hours(totals?.totalMinutes ?? 0)} />
        <StatCard label="산정 금액" value={won(totals?.totalAmount ?? 0)} tone="accent" />
      </div>

      <SectionCard title={`과목 · 수업별 내역 (${groups.length})`}>
        {worksheet.isPending || loadingInstructors ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <EmptyState message="선택한 기간에 수업 회차가 없습니다." />
        ) : (
          <TableWrap minWidth={760}>
            <table className="table">
              <thead>
                <tr>
                  <th>과목</th><th>수업</th><th className="text-right">회차</th>
                  <th className="text-right">시수</th><th className="text-right">금액</th><th></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isOpen = open.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr>
                        <td>{group.subjectName}</td>
                        <td className="font-medium">{group.courseName}</td>
                        <td className="text-right mono">{group.rows.length}회</td>
                        <td className="text-right mono">{hours(group.totalMinutes)}</td>
                        <td className="text-right mono">
                          {won(group.effectiveAmount)}
                          {group.unpricedCount > 0 && (
                            <span className="block text-caption text-warning">미책정 {group.unpricedCount}건</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button type="button" className="btn btn-sm" onClick={() => toggle(group.key)}>
                            {isOpen ? '접기' : '회차 보기'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="bg-canvas-subtle p-0">
                            <TableWrap minWidth={820}>
                              <table className="table text-caption">
                                <thead>
                                  <tr>
                                    <th>수업 일시</th><th>강사 출결</th><th>학생 출결</th>
                                    <th>리포트</th><th className="text-right">회차 금액</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((row) => (
                                    <tr key={row.sessionId}>
                                      <td className="mono whitespace-nowrap">
                                        <Link href={internalRoute.session(row.sessionId)} className="hover:underline">
                                          {row.sessionDate}{row.startTime ? ` ${row.startTime}` : ''}
                                        </Link>
                                      </td>
                                      <td><Badge tone="neutral">{attendanceLabel(row.instructorAttendance)}</Badge></td>
                                      <td>
                                        {row.participants.length === 0 ? (
                                          <span className="text-fg-subtle">수강생 없음</span>
                                        ) : row.participants.map((participant) => (
                                          <div key={participant.studentId}>
                                            {participant.name} · {attendanceLabel(participant.attendance)}
                                          </div>
                                        ))}
                                      </td>
                                      <td>
                                        {row.participants.length === 0 ? (
                                          <span className="text-fg-subtle">해당 없음</span>
                                        ) : row.participants.map((participant) => {
                                          const report = participant.reportApproval
                                            ? reportApprovalBadge(participant.reportApproval)
                                            : null;
                                          return (
                                            <div key={participant.studentId}>
                                              {participant.reportId != null ? (
                                                <Link href={internalRoute.report(participant.reportId)} className="hover:underline">
                                                  {participant.name} · {report?.label ?? '상세'}
                                                </Link>
                                              ) : (
                                                <span className="text-fg-subtle">{participant.name} · 미작성</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </td>
                                      <td className="text-right"><PayoutWorksheetAmountCell row={row} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </TableWrap>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      {finance && (
        <SectionCard title={`정산서 이력 (${myPayouts.length})`}>
          {myPayouts.length === 0 ? (
            <EmptyState message="생성된 정산서가 없습니다." />
          ) : (
            <TableWrap minWidth={640}>
              <table className="table">
                <thead><tr><th>기간</th><th>회차</th><th>산정액</th><th>최종액</th><th>상태</th></tr></thead>
                <tbody>
                  {myPayouts.map((payout) => (
                    <tr key={payout.id}>
                      <td><Link href={internalRoute.payoutRecord(payout.id)} className="mono hover:underline">{payout.periodStart} ~ {payout.periodEnd}</Link></td>
                      <td className="mono">{payout.sessionCount}회</td>
                      <td className="mono">{won(payout.computedAmount)}</td>
                      <td className="mono">{won(payout.amount)}</td>
                      <td><PayoutStatusBadge p={payout} /></td>
                    </tr>
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
