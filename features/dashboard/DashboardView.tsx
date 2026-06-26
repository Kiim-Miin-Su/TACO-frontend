import {
  Badge,
  StatCard,
  SectionCard,
  StatusDot,
  IconArrowDown,
  IconArrowUp,
  IconUsers,
  IconReceipt,
} from '@/components/ui';
import { won, shortDate } from '@/lib/format';
import { enrollments, txns, statusTone, statusLabel } from './data';

export function DashboardView() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold">대시보드</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">2026년 6월 · 이번 달 운영 현황</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
          <span className="dot" style={{ backgroundColor: 'var(--color-success)' }} />
          in-memory API 연결됨
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="이번 달 입금" value={won(7420000)} tone="success"
          icon={<IconArrowDown />} sub={<span className="text-success font-medium">+12.4%</span>} />
        <StatCard label="이번 달 출금" value={won(3260000)} tone="attention"
          icon={<IconArrowUp />} sub="강사 페이 · 지출" />
        <StatCard label="신규 등록" value="18건" tone="accent"
          icon={<IconUsers />} sub="상담 → 등록 전환 9건" />
        <StatCard label="미수금" value={won(640000)} tone="danger"
          icon={<IconReceipt />} sub="청구 3건 대기" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent enrollments */}
        <div className="lg:col-span-2">
          <SectionCard title="최근 수강 등록" action={<button className="btn btn-sm">전체 보기</button>}>
            <table className="table">
              <thead>
                <tr>
                  <th>학생</th>
                  <th>코스</th>
                  <th>상태</th>
                  <th className="text-right">금액</th>
                  <th className="text-right">등록일</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.student}</div>
                      <div className="text-[12px] text-fg-subtle">{e.english}</div>
                    </td>
                    <td className="text-fg-muted">{e.course}</td>
                    <td>
                      <Badge tone={statusTone[e.status]}>
                        <StatusDot tone={statusTone[e.status]} label={statusLabel[e.status]} />
                      </Badge>
                    </td>
                    <td className="text-right mono">{won(e.amount)}</td>
                    <td className="text-right text-fg-muted mono">{shortDate(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>

        {/* Transactions ledger */}
        <div>
          <SectionCard title="입·출금 원장" action={<span className="badge badge-neutral">오늘</span>}>
            <ul className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
              {txns.map((t) => {
                const inbound = t.dir === 'in';
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="w-7 h-7 rounded-full grid place-items-center shrink-0"
                      style={{
                        backgroundColor: inbound ? 'var(--color-success-subtle)' : 'var(--color-attention-subtle)',
                        color: inbound ? 'var(--color-success)' : 'var(--color-attention)',
                      }}
                    >
                      {inbound ? <IconArrowDown /> : <IconArrowUp />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{t.label}</div>
                      <div className="text-[11px] text-fg-subtle uppercase">{t.method} · {shortDate(t.at)}</div>
                    </div>
                    <div className={`mono text-[13px] font-semibold ${inbound ? 'text-success' : 'text-fg'}`}>
                      {inbound ? '+' : '−'}{won(t.amount)}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-3 border-t">
              <button className="btn btn-sm w-full justify-center">전체 원장 보기</button>
            </div>
          </SectionCard>
        </div>
      </div>

      <p className="mt-6 text-[12px] text-fg-subtle">
        TACO ERP · 데모 데이터 · 디자인 시스템 미리보기 (밝은 테마)
      </p>
    </div>
  );
}
