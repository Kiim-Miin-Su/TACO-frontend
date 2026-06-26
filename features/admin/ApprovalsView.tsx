'use client';
import { Badge, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { won } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import { AdminHeader } from './AdminShell';
import { categoryLabel } from '@/features/expenses/labels';

// 승인은 대표(super_admin) 전용
export function ApprovalsView() {
  const store = useTacoStore();
  const isSuper = store.currentRole === 'super_admin';
  const instructorName = (id: number) => store.instructors.find((i) => i.id === id)?.name ?? '—';

  const pendingExpenses = store.expenses.filter((e) => e.status === 'requested');
  const pendingPayouts = store.instructorPayouts.filter((p) => p.status === 'pending');

  if (!isSuper) {
    return (
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <AdminHeader />
        <div className="card card-pad text-[14px] text-fg-muted">
          🔒 승인 센터는 <b>대표(CEO)</b> 전용입니다. 현재 역할: {roleLabel[store.currentRole]} — 우측 상단에서 대표로 전환하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <AdminHeader />

      <SectionCard title={`지출 승인 대기 (${pendingExpenses.length})`}>
        {pendingExpenses.length === 0 ? (
          <div className="p-4 text-[13px] text-fg-subtle">대기 중인 지출이 없습니다.</div>
        ) : (
          <table className="table">
            <thead><tr><th>항목</th><th>분류</th><th className="text-right">금액</th><th>지출일</th><th></th></tr></thead>
            <tbody>
              {pendingExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td className="text-fg-muted">{categoryLabel[e.category]}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td className="mono text-fg-muted">{e.spentAt}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={() => store.approveExpense(e.id)}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={() => store.rejectExpense(e.id)}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title={`강사 페이 승인 대기 (${pendingPayouts.length})`}>
        {pendingPayouts.length === 0 ? (
          <div className="p-4 text-[13px] text-fg-subtle">대기 중인 정산이 없습니다.</div>
        ) : (
          <table className="table">
            <thead><tr><th>강사</th><th>기간</th><th className="text-right">금액</th><th></th></tr></thead>
            <tbody>
              {pendingPayouts.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{instructorName(p.instructorId)}</td>
                  <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                  <td className="text-right mono">{won(p.amount)} <span className="text-fg-subtle">({p.sessionCount ?? 0}회)</span></td>
                  <td className="text-right">
                    <button className="btn btn-sm btn-primary" onClick={() => store.approvePayout(p.id)}>승인</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">승인 시 지출은 즉시 출금 반영, 강사 페이는 승인 후 강사페이 탭에서 지급 처리합니다.</p>
    </div>
  );
}
