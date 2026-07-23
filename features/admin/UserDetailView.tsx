'use client';
// [유저 관리 2026-07-20 대표 지시] 유저 상세 — 리스트 행 클릭 → **권한 체크(admin.area) +
//  비밀번호 재확인(sudo)** → 상세 → 대표는 수정(name/phone/email/role)·삭제(pending/rejected)·
//  인증 메일 재발송까지. 재사용: DetailStates(단건 404/403 표준)·ModalShell 계열(ReasonModal)·
//  validation.ts(전화 형식)·중앙 훅(useUser/useAdminUpdateUser — CLAUDE §18). sudo 상태는
//  lib/sudo 단일 소스(5분 TTL·저장소 미사용), 검증 권위는 서버 POST /auth/reauth.
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3] 오류 파싱 단일 진실원
import { useRouter } from 'next/navigation';
import { Badge, DetailStates, SectionCard, type Tone } from '@/components/ui';
import { AuthField } from '@/components/auth/AuthShell';
import { ReasonModal } from '@/components/ReasonModal';
import { roleLabel } from '@/lib/roles';
import { isSudoValid, markSudoVerified } from '@/lib/sudo';
import { useAccountAccess } from '@/lib/useAccountAccess';
import {
  useAdminUpdateUser, useDeletePendingAccount, useReauth, useResendPendingVerification, useUser,
} from '@/lib/queries';
import { isValidKrPhone } from '@/lib/validation';
import { dateOnly } from '@/lib/format';
import type { AccountRole } from '@/types';

const STATUS_LABEL: Record<string, string> = { active: '활성', pending: '승인 대기', rejected: '반려됨' };
const STATUS_TONE: Record<string, Tone> = { active: 'success', pending: 'attention', rejected: 'danger' };
const EDITABLE_ROLES = ['instructor', 'manager', 'admin'] as const;

// ── 비밀번호 재확인 게이트(서버 권위 /auth/reauth — 실패 문구 그대로 표출) ─────────
function SudoGate({ onVerified }: { onVerified: () => void }) {
  const reauth = useReauth();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || reauth.isPending) return;
    setErr(null);
    reauth.mutate(password, {
      onSuccess: () => { markSudoVerified(); onVerified(); },
      onError: (caught) => setErr(apiErrorMessage(caught, '확인에 실패했습니다. 잠시 후 다시 시도해 주세요.')),
    });
  }

  return (
    <SectionCard title="본인 확인">
      <form onSubmit={submit} className="p-4 max-w-[420px] space-y-3">
        <p className="text-body text-fg-muted">계정 상세는 민감 정보입니다. 현재 비밀번호를 다시 입력해 주세요. (5분간 유지)</p>
        <AuthField label="현재 비밀번호">
          <input className="input w-full" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus required maxLength={72} />
        </AuthField>
        {err && <p className="text-caption text-danger" role="alert">{err}</p>}
        <button className="btn btn-primary h-10 w-full" disabled={reauth.isPending || !password}>
          {reauth.isPending ? '확인 중…' : '확인하고 계속'}
        </button>
      </form>
    </SectionCard>
  );
}

function DetailBody({ userId }: { userId: number }) {
  const router = useRouter();
  const { role } = useAccountAccess();
  const isSuper = role === 'super_admin';
  const query = useUser(userId);
  const update = useAdminUpdateUser();
  const resend = useResendPendingVerification();
  const remove = useDeletePendingAccount();
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string; role: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <DetailStates query={query} notFoundMessage="계정을 찾을 수 없습니다(삭제되었을 수 있음)." backHref="/admin/users">
      {(u) => {
        const editable = isSuper && u.role !== 'super_admin';
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
            action={<Badge tone={STATUS_TONE[u.status] ?? 'neutral'}>{STATUS_LABEL[u.status] ?? u.status}</Badge>}
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
              </div>
              <p className="text-caption text-fg-subtle">
                아이디 변경은 마이페이지 프로필 변경(중복 체크·즉시 적용), 학력(대학·전공)은 강사 프로필이
                권위입니다. 역할·이메일을 바꾸면 해당 계정의 기존 로그인이 모두 종료됩니다. 모든 변경은
                감사 이력에 남습니다.
              </p>
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
