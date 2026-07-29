'use client';
// [유저 관리 2026-07-20 대표 지시] 유저 상세 — 리스트 행 클릭 → **권한 체크(admin.area) +
//  비밀번호 재확인(sudo)** → 상세 → 대표는 수정(name/phone/email/role)·삭제(pending/rejected)·
//  인증 메일 재발송까지. 재사용: DetailStates(단건 404/403 표준)·ModalShell 계열(ReasonModal)·
//  validation.ts(전화 형식)·중앙 훅(useUser/useAdminUpdateUser — CLAUDE §18). sudo 상태는
//  lib/sudo 단일 소스(5분 TTL·저장소 미사용), 검증 권위는 서버 POST /auth/reauth.
import { ACCOUNT_STATUS_LABEL } from '@/lib/domain/accounts'; // [P2 FE-7]
import { hasCapability } from '@/lib/access-control';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3] 오류 파싱 단일 진실원
import { useRouter } from 'next/navigation';
import { Badge, DetailStates, SectionCard, SudoActionModal, type Tone } from '@/components/ui';
import { AuthField } from '@/components/auth/AuthShell';
import { ReasonModal } from '@/components/ReasonModal';
import { roleLabel } from '@/lib/roles';
import { isSudoValid, markSudoVerified } from '@/lib/sudo';
import { useAccountAccess } from '@/lib/useAccountAccess';
import {
  useAdminUpdateUser, useAuthEvents, useDeletePendingAccount, useReauth, useResendPendingVerification,
  useRestoreUser, useTerminateUser, useUser,
} from '@/lib/queries';
import { isValidKrPhone } from '@/lib/validation';
import { dateOnly, kstDateTime } from '@/lib/format';
import type { AccountRole } from '@/types';
import type { AuthEventType } from '@kms545487/contracts';

const STATUS_LABEL = ACCOUNT_STATUS_LABEL; // [P2 FE-7] 진실원(lib/domain/accounts)
const STATUS_TONE: Record<string, Tone> = { active: 'success', pending: 'attention', rejected: 'danger' };
const EDITABLE_ROLES = ['instructor', 'manager', 'admin'] as const;
const AUTH_EVENT_OPTIONS: Array<{ value: '' | AuthEventType; label: string }> = [
  { value: '', label: '전체 이벤트' },
  { value: 'login_success', label: '로그인 성공' },
  { value: 'login_failure', label: '로그인 실패' },
  { value: 'logout', label: '로그아웃' },
  { value: 'password_reset_completed', label: '비밀번호 재설정' },
  { value: 'refresh_reuse_blocked', label: '토큰 재사용 차단' },
  { value: 'csrf_origin_blocked', label: 'Origin 차단' },
];
const AUTH_EVENT_LABEL = Object.fromEntries(
  AUTH_EVENT_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]),
) as Partial<Record<AuthEventType, string>>;

function AuthEventHistory({ userId }: { userId: number }) {
  const { can } = useAccountAccess();
  const [eventType, setEventType] = useState<'' | AuthEventType>('');
  const events = useAuthEvents({ userId, eventType: eventType || undefined, limit: 50 });
  if (!can('security.events.read')) return null;
  return (
    <section className="border-t border-line-muted pt-4" aria-labelledby="auth-event-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="auth-event-heading" className="text-body font-semibold">접속·보안 이력</h2>
          <p className="text-caption text-fg-subtle">최근 50건 · 원본 IP와 식별자 hash는 화면에 표시하지 않습니다.</p>
        </div>
        <select
          className="input h-8 w-40 text-caption"
          aria-label="보안 이벤트 유형"
          value={eventType}
          onChange={(event) => setEventType(event.target.value as '' | AuthEventType)}
        >
          {AUTH_EVENT_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {events.isPending ? (
        <p className="text-caption text-fg-subtle">이력을 불러오는 중입니다.</p>
      ) : events.isError ? (
        <p className="text-caption text-danger" role="alert">보안 이력을 불러오지 못했습니다. 재인증 상태를 확인해 주세요.</p>
      ) : !events.data?.length ? (
        <p className="text-caption text-fg-subtle">조건에 맞는 이력이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[520px]">
            <thead><tr><th>일시</th><th>이벤트</th><th>결과</th><th>실패 코드</th></tr></thead>
            <tbody>
              {events.data.map((event) => (
                <tr key={event.id}>
                  <td className="mono whitespace-nowrap">{kstDateTime(event.at)}</td>
                  <td>{AUTH_EVENT_LABEL[event.eventType] ?? event.eventType}</td>
                  <td><Badge tone={event.success ? 'success' : 'danger'}>{event.success ? '성공' : '실패'}</Badge></td>
                  <td className="mono">{event.failureCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SudoGate({ onVerified }: { onVerified: () => void }) {
  const router = useRouter();
  const reauth = useReauth();
  const [error, setError] = useState<unknown | null>(null);

  return (
    <>
      <SectionCard title="계정 상세">
        <div className="p-4 text-body text-fg-muted">본인 확인 후 계정 상세를 표시합니다.</div>
      </SectionCard>
      <SudoActionModal
        pending={reauth.isPending}
        error={error}
        message="계정 상세는 민감 정보입니다. 현재 비밀번호를 입력해 주세요."
        onClose={() => router.push('/admin/users')}
        onSubmit={(password) => {
          setError(null);
          reauth.mutate(password, {
            onSuccess: () => {
              markSudoVerified();
              onVerified();
            },
            onError: setError,
          });
        }}
      />
    </>
  );
}

function DetailBody({ userId }: { userId: number }) {
  const router = useRouter();
  const { role } = useAccountAccess();
  const isSuper = hasCapability(role, 'executive.manage');
  const query = useUser(userId);
  const update = useAdminUpdateUser();
  const resend = useResendPendingVerification();
  const remove = useDeletePendingAccount();
  const terminate = useTerminateUser();
  const restore = useRestoreUser();
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string; role: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<'terminate' | 'restore' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <DetailStates query={query} notFoundMessage="계정을 찾을 수 없습니다(삭제되었을 수 있음)." backHref="/admin/users">
      {(u) => {
        const terminated = !!u.deletedAt;
        const editable = isSuper && u.role !== 'super_admin' && !terminated;
        const form = edit ?? { name: u.name, phone: u.phone ?? '', email: u.email ?? '', role: u.role };
        const save = () => {
          if (!edit || update.isPending) return;
          setErr(null); setMsg(null);
          if (edit.phone && !isValidKrPhone(edit.phone)) { setErr('전화번호는 010-1234-5678 형식으로 입력해 주세요.'); return; }
          const patch: { name?: string; phone?: string; email?: string; role?: string } = {};
          if (edit.name !== u.name) patch.name = edit.name;
          if (edit.phone !== (u.phone ?? '')) patch.phone = edit.phone;
          if (edit.email !== (u.email ?? '')) patch.email = edit.email;
          if (edit.role !== u.role) patch.role = edit.role;
          if (!Object.keys(patch).length) { setEdit(null); return; }
          update.mutate({ id: u.id, patch }, {
            onSuccess: () => {
              setEdit(null);
              setMsg(patch.role || patch.email ? '저장했습니다. 역할·이메일 변경으로 해당 계정은 재로그인이 필요합니다.' : '저장했습니다.');
            },
            onError: (caught) => setErr(apiErrorMessage(caught, '저장하지 못했습니다.')),
          });
        };
        return (
          <SectionCard
            title={`${u.name} (${u.webId})`}
            action={<Badge tone={terminated ? 'neutral' : STATUS_TONE[u.status] ?? 'neutral'}>{terminated ? '종료됨' : STATUS_LABEL[u.status] ?? u.status}</Badge>}
          >
            <div className="p-4 space-y-4">
              {msg && <p className="text-caption text-accent" role="status">{msg}</p>}
              <div className="grid grid-cols-2 gap-3 max-w-[640px]">
                <AuthField label="이름">
                  {editable && edit ? (
                    <input className="input w-full" value={form.name} onChange={(e) => setEdit({ ...form, name: e.target.value })} maxLength={50} />
                  ) : <div className="text-body font-medium">{u.name}</div>}
                </AuthField>
                <AuthField label="역할">
                  {editable && edit ? (
                    <select className="input w-full" value={form.role} onChange={(e) => setEdit({ ...form, role: e.target.value })}>
                      {EDITABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                    </select>
                  ) : <div className="text-body">{roleLabel[u.role as AccountRole] ?? u.role}</div>}
                </AuthField>
                <AuthField label="이메일">
                  {editable && edit ? (
                    <input className="input w-full" type="email" value={form.email} onChange={(e) => setEdit({ ...form, email: e.target.value })} maxLength={320} />
                  ) : <div className="text-body">{u.email ?? '—'} {u.emailVerified === true ? <span className="text-caption text-success">(인증 완료)</span> : u.emailVerified === false ? <span className="text-caption text-fg-subtle">(미인증)</span> : null}</div>}
                </AuthField>
                <AuthField label="전화번호">
                  {editable && edit ? (
                    <input className="input w-full" type="tel" value={form.phone} onChange={(e) => setEdit({ ...form, phone: e.target.value })} placeholder="010-1234-5678" />
                  ) : <div className="text-body mono">{u.phone ?? '—'}</div>}
                </AuthField>
                <AuthField label="가입일">
                  <div className="text-body mono">{u.createdAt ? dateOnly(u.createdAt) : '—'}</div>
                </AuthField>
                {isSuper && (
                  <AuthField label="주민등록번호(마스킹)">
                    <div className="text-body mono">{u.rrnMasked ?? '—'}</div>
                  </AuthField>
                )}
              </div>
              {err && <p className="text-caption text-danger" role="alert">{err}</p>}
              <div className="flex gap-2 flex-wrap">
                {editable && (edit ? (
                  <>
                    <button className="btn btn-sm btn-primary" disabled={update.isPending} onClick={save}>{update.isPending ? '저장 중…' : '저장'}</button>
                    <button className="btn btn-sm" onClick={() => { setEdit(null); setErr(null); }}>취소</button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => { setMsg(null); setEdit({ name: u.name, phone: u.phone ?? '', email: u.email ?? '', role: u.role }); }}>수정</button>
                ))}
                {isSuper && u.status === 'pending' && u.emailVerified === false && (
                  <button className="btn btn-sm" disabled={resend.isPending}
                    onClick={() => resend.mutate(u.id, {
                      onSuccess: (res) => setMsg(res.devVerifyLink ? `인증 메일을 다시 보냈습니다. (개발 링크: ${res.devVerifyLink})` : '인증 메일을 다시 보냈습니다.'),
                      onError: (caught) => setErr(apiErrorMessage(caught, '인증 메일을 보내지 못했습니다.')),
                    })}>
                    인증 메일 재발송
                  </button>
                )}
                {isSuper && (u.status === 'pending' || u.status === 'rejected') && (
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleteOpen(true)}>삭제</button>
                )}
                {isSuper && u.role !== 'super_admin' && u.status === 'active' && (
                  <button
                    className={`btn btn-sm ${terminated ? 'btn-primary' : 'btn-danger'}`}
                    onClick={() => setLifecycleAction(terminated ? 'restore' : 'terminate')}
                  >
                    {terminated ? '계정 복구' : '재직 종료'}
                  </button>
                )}
              </div>
              <p className="text-caption text-fg-subtle">
                아이디 변경은 마이페이지 프로필 변경(중복 체크·즉시 적용), 학력(대학·전공)은 강사 프로필이
                권위입니다. 역할·이메일을 바꾸면 해당 계정의 기존 로그인이 모두 종료됩니다. 모든 변경은
                감사 이력에 남습니다.
              </p>
              <AuthEventHistory userId={u.id} />
            </div>
            {deleteOpen && (
              <ReasonModal
                mode="input"
                title="계정 삭제 — 사유 필수 (같은 아이디·이메일로 재가입 가능해집니다)"
                submitLabel="삭제"
                placeholder="삭제 사유를 입력하세요 (감사 이력에 남습니다)"
                onClose={() => setDeleteOpen(false)}
                onSubmit={(reason) => {
                  remove.mutate({ id: u.id, reason }, {
                    onSuccess: () => router.push('/admin/users'),
                    onError: (caught) => setErr(apiErrorMessage(caught, '삭제하지 못했습니다.')),
                  });
                  setDeleteOpen(false);
                }}
              />
            )}
            {lifecycleAction && (
              <ReasonModal
                mode="input"
                title={lifecycleAction === 'terminate' ? '직원 재직 종료 — 사유 필수' : '직원 계정 복구 — 사유 필수'}
                submitLabel={lifecycleAction === 'terminate' ? '재직 종료' : '계정 복구'}
                placeholder="감사 이력에 남길 사유를 5자 이상 입력하세요"
                onClose={() => setLifecycleAction(null)}
                onSubmit={(reason) => {
                  const action = lifecycleAction;
                  const mutation = action === 'terminate' ? terminate : restore;
                  mutation.mutate({ id: u.id, reason }, {
                    onSuccess: () => {
                      setMsg(action === 'terminate'
                        ? '계정을 종료했습니다. 기존 로그인은 즉시 만료됩니다.'
                        : '계정을 복구했습니다. 다시 로그인할 수 있습니다.');
                      setLifecycleAction(null);
                    },
                    onError: (caught) => {
                      setErr(apiErrorMessage(caught, action === 'terminate' ? '계정을 종료하지 못했습니다.' : '계정을 복구하지 못했습니다.'));
                      setLifecycleAction(null);
                    },
                  });
                }}
              />
            )}
          </SectionCard>
        );
      }}
    </DetailStates>
  );
}

export function UserDetailView({ userId }: { userId: number }) {
  const { can } = useAccountAccess();
  const [sudo, setSudo] = useState(() => isSudoValid());
  if (!can('admin.area')) return null;
  if (!sudo) return <SudoGate onVerified={() => setSudo(true)} />;
  return <DetailBody userId={userId} />;
}
