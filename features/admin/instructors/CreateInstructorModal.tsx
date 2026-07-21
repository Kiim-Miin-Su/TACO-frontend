'use client';

import { useState } from 'react';
import { Field, ModalShell } from '@/components/ui';
import { useCreateInstructor } from '@/lib/queries';
import { WEB_ID_MIN, passwordLengthError } from '@/lib/validation';
import { emptyInstructorProfileForm, InstructorProfileFields, type InstructorProfileForm } from './InstructorProfileFields';

const messageOf = (error: unknown) => {
  const value = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(value) ? value.join(' ') : value ?? '강사를 등록하지 못했습니다.';
};

export function CreateInstructorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const create = useCreateInstructor();
  const [account, setAccount] = useState({ webId: '', password: '', passwordConfirm: '' });
  const [profile, setProfile] = useState<InstructorProfileForm>(() => emptyInstructorProfileForm());
  const [error, setError] = useState<string | null>(null);
  const passwordError = account.password ? passwordLengthError(account.password) : null;
  const canSubmit = account.webId.trim().length >= WEB_ID_MIN && profile.name.trim().length > 0
    && account.password === account.passwordConfirm && !passwordError && Number(profile.defaultHourlyRate) >= 0;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSubmit || create.isPending) return;
    setError(null);
    create.mutate({
      webId: account.webId.trim(),
      password: account.password,
      name: profile.name.trim(),
      ...(profile.email.trim() ? { email: profile.email.trim() } : {}),
      ...(profile.phone.trim() ? { phone: profile.phone.trim() } : {}),
      ...(profile.university.trim() ? { university: profile.university.trim() } : {}),
      ...(profile.major.trim() ? { major: profile.major.trim() } : {}),
      ...(profile.birthYear ? { birthYear: Number(profile.birthYear) } : {}),
      ...(profile.countryCode.trim() ? { countryCode: profile.countryCode.trim() } : {}),
      ...(profile.timeZone.trim() ? { timeZone: profile.timeZone.trim() } : {}),
      defaultHourlyRate: Number(profile.defaultHourlyRate) || 0,
      canTeachKinder: profile.canTeachKinder,
    }, {
      onSuccess: (created) => onCreated(created.name),
      onError: (caught) => setError(messageOf(caught)),
    });
  };

  return (
    <ModalShell title="강사 등록" size="lg" onClose={onClose} footer={(
      <>
        <button type="button" className="btn btn-sm" onClick={onClose}>취소</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!canSubmit || create.isPending} onClick={() => submit()}>{create.isPending ? '등록 중…' : '등록'}</button>
      </>
    )}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="로그인 아이디"><input className="input w-full" value={account.webId} onChange={(e) => setAccount({ ...account, webId: e.target.value })} minLength={WEB_ID_MIN} maxLength={50} required data-modal-autofocus="true" /></Field>
          <Field label="초기 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} required maxLength={72} /></Field>
          <Field label="비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" value={account.passwordConfirm} onChange={(e) => setAccount({ ...account, passwordConfirm: e.target.value })} required maxLength={72} /></Field>
        </div>
        {passwordError && <p className="text-caption text-danger" role="alert">{passwordError}</p>}
        {!!account.passwordConfirm && account.password !== account.passwordConfirm && <p className="text-caption text-danger" role="alert">비밀번호가 일치하지 않습니다.</p>}
        <InstructorProfileFields value={profile} onChange={setProfile} />
        {error && <p className="text-caption text-danger" role="alert">{error}</p>}
        <p className="text-caption text-fg-subtle">강사별 기본 시급과 Kinder 가능 여부는 강사 프로필이 원본입니다. 생성·변경·삭제는 감사 이력에 남습니다.</p>
      </form>
    </ModalShell>
  );
}
