'use client';
// [핫픽스 확장 2026-07-20 대표 지시] 유저 관리 탭 — 전 계정(활성·대기·반려)을 한 화면에서 관리.
//  승인센터의 가입 승인 목록은 **pending만** 보여줘 반려·활성 계정 관리 지점이 없었다(대표 지적).
//  · 목록: GET /users(관리자) — 상태·이메일 인증·가입일 포함. 반려(rejected) 계정도 이력으로 보인다.
//  · 액션(대표 전용): 미인증 pending=인증 메일 재발송 · pending/rejected=삭제(soft delete —
//    행은 deleted_at으로 보존되고 audit_log에 사유·행위자가 남는다. 아이디·이메일은 해제되어
//    같은 식별자로 재가입 가능, 주민등록번호 암호문은 즉시 파기).
//  · 승인/반려 결정 자체는 승인센터(가입 승인 대기)가 단일 창구 — 여기서는 링크로 안내.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, ClickableTableRow, EmptyState, SectionCard, TableWrap, type Tone } from '@/components/ui';
import { ReasonModal } from '@/components/ReasonModal';
import { CreateStaffModal } from '@/features/admin/CreateStaffModal';
import { roleLabel } from '@/lib/roles';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { useDeletePendingAccount, useResendPendingVerification, useUsers } from '@/lib/queries';
import { dateOnly } from '@/lib/format';
import type { AccountRole } from '@/types';

const STATUS_LABEL: Record<string, string> = { active: '활성', pending: '승인 대기', rejected: '반려됨' };
const STATUS_TONE: Record<string, Tone> = { active: 'success', pending: 'attention', rejected: 'danger' };
const FILTERS = ['all', 'active', 'pending', 'rejected'] as const;

export function UsersView() {
  const { role, can } = useAccountAccess();
  const isSuper = role === 'super_admin';
  const { data: users = [], isLoading } = useUsers();
  const resend = useResendPendingVerification();
  const remove = useDeletePendingAccount();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false); // [07-20] Create는 리스트뷰 분리 버튼(대표 지시)
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(
    () => users
      .filter((u) => filter === 'all' || u.status === filter)
      .sort((a, b) => (a.status === b.status ? a.webId.localeCompare(b.webId) : a.status.localeCompare(b.status))),
    [users, filter],
  );

  const serverMessage = (error: unknown, fallback: string): string => {
    const ax = error as { response?: { data?: { message?: string | string[] } } };
    const m = ax.response?.data?.message;
    return (Array.isArray(m) ? m.join(' ') : m) ?? fallback;
  };

  if (!can('admin.area')) return null;

  return (
    <SectionCard
      title={`유저 관리 (${rows.length})`}
      action={(
        <div className="flex gap-1.5 items-center">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'badge-accent' : ''}`}>
              {f === 'all' ? '전체' : STATUS_LABEL[f]}
            </button>
          ))}
          {isSuper && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreateOpen(true)}>+ 직접 등록</button>
          )}
        </div>
      )}
    >
      {msg && <div className="px-4 pt-3 text-caption text-accent" role="status">{msg}</div>}
      {isLoading ? (
        <EmptyState message="불러오는 중…" />
      ) : rows.length === 0 ? (
        <EmptyState message="해당 상태의 계정이 없습니다." />
      ) : (
        <TableWrap minWidth={960}>
          <table className="table">
            <thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th>이메일 인증</th><th>가입일</th><th className="text-right"></th></tr></thead>
            <tbody>
              {rows.map((u) => {
                const deletable = isSuper && (u.status === 'pending' || u.status === 'rejected');
                const resendable = isSuper && u.status === 'pending' && u.emailVerified !== true;
                return (
                  // [07-20] 행 클릭 → 상세(/admin/users/[id]) — 진입 시 비밀번호 재확인(sudo)은 상세가 강제.
                  <ClickableTableRow key={u.id} href={`/admin/users/${u.id}`} label={`${u.name} 상세`}>
                    <td className="font-medium mono">{u.webId}</td>
                    <td>{u.name}</td>
                    <td className="text-fg-muted">{u.email ?? '—'}</td>
                    <td>{roleLabel[u.role as AccountRole] ?? u.role}</td>
                    <td><Badge tone={STATUS_TONE[u.status] ?? 'neutral'}>{STATUS_LABEL[u.status] ?? u.status}</Badge></td>
                    <td>{u.emailVerified === true ? <span className="text-success">완료</span> : u.emailVerified === false ? <span className="text-fg-subtle">미완료</span> : '—'}</td>
                    <td className="mono text-fg-muted whitespace-nowrap">{u.createdAt ? dateOnly(u.createdAt) : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      {resendable && (
                        <button className="btn btn-sm mr-1.5" disabled={resend.isPending}
                          onClick={(ev) => { ev.stopPropagation(); resend.mutate(u.id, {
                            onSuccess: (res) => setMsg(res.devVerifyLink ? `인증 메일을 다시 보냈습니다. (개발 링크: ${res.devVerifyLink})` : `${u.name}님에게 인증 메일을 다시 보냈습니다.`),
                            onError: (error) => setMsg(serverMessage(error, '인증 메일을 보내지 못했습니다.')),
                          }); }}>
                          인증 메일 재발송
                        </button>
                      )}
                      {isSuper && u.status === 'pending' && (
                        <Link href="/admin/approvals" className="btn btn-sm mr-1.5" onClick={(ev) => ev.stopPropagation()}>승인센터 →</Link>
                      )}
                      {deletable && (
                        <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); setDeleteTarget(u.id); }}>삭제</button>
                      )}
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="px-4 py-3 text-caption text-fg-subtle">
        반려된 계정은 이력으로 남습니다. 삭제는 소프트 삭제(감사 기록 보존)이며 아이디·이메일이
        해제되어 같은 정보로 다시 가입할 수 있고, 주민등록번호는 즉시 파기됩니다. 활성 계정은
        삭제할 수 없습니다(비활성화가 필요하면 별도 요청).
      </p>
      {createOpen && (
        <CreateStaffModal
          onClose={() => setCreateOpen(false)}
          onCreated={(name) => { setCreateOpen(false); setMsg(`${name}님 계정을 등록했습니다(즉시 로그인 가능).`); }}
        />
      )}
      {deleteTarget != null && (
        <ReasonModal
          mode="input"
          title="계정 삭제 — 사유 필수 (같은 아이디·이메일로 재가입 가능해집니다)"
          submitLabel="삭제"
          placeholder="삭제 사유를 입력하세요 (감사 이력에 남습니다)"
          onClose={() => setDeleteTarget(null)}
          onSubmit={(reason) => {
            remove.mutate({ id: deleteTarget, reason }, {
              onSuccess: () => setMsg('계정을 삭제했습니다. 같은 아이디·이메일로 다시 가입할 수 있습니다.'),
              onError: (error) => setMsg(serverMessage(error, '삭제하지 못했습니다.')),
            });
            setDeleteTarget(null);
          }}
        />
      )}
    </SectionCard>
  );
}
