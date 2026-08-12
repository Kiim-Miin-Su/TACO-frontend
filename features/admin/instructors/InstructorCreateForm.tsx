'use client';

import { useState, type FormEvent } from 'react';
import type { InstructorAggregate } from '@/types';
import { Field } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import { useCreateInstructor } from '@/lib/queries';
import { useSudoAction } from '@/lib/hooks/useSudoAction';
import { WEB_ID_MIN, passwordLengthError } from '@/lib/validation';
import { emptyInstructorProfileForm, InstructorProfileFields, type InstructorProfileForm } from './InstructorProfileFields';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { staffEnglishNameError } from '@kms545487/contracts';

export function InstructorCreateForm({
  compact = false,
  onCreated,
}: {
  compact?: boolean;
  onCreated?: (instructor: InstructorAggregate) => void;
}) {
  const create = useCreateInstructor();
  const sudoAction = useSudoAction();
  const { can } = useAccountAccess();
  const canManageFinance = can('finance.access');
  const [account, setAccount] = useState({ webId: '', password: '', passwordConfirm: '' });
  const [profile, setProfile] = useState<InstructorProfileForm>(() => emptyInstructorProfileForm());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const passwordError = account.password ? passwordLengthError(account.password) : null;
  const englishNameError = profile.englishName ? staffEnglishNameError(profile.englishName) : null;
  const canSubmit = account.webId.trim().length >= WEB_ID_MIN && profile.name.trim().length > 0
    && profile.englishName.trim().length > 0 && !englishNameError
    && account.password === account.passwordConfirm && !passwordError
    && (!canManageFinance || Number(profile.defaultHourlyRate) >= 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || create.isPending || sudoAction.isPending) return;
    setError(null);
    setSuccess('');
    const input = {
      webId: account.webId.trim(),
      password: account.password,
      name: profile.name.trim(),
      englishName: profile.englishName.trim(),
      ...(profile.email.trim() ? { email: profile.email.trim() } : {}),
      ...(profile.phone.trim() ? { phone: profile.phone.trim() } : {}),
      ...(profile.university.trim() ? { university: profile.university.trim() } : {}),
      ...(profile.major.trim() ? { major: profile.major.trim() } : {}),
      ...(profile.birthYear ? { birthYear: Number(profile.birthYear) } : {}),
      ...(profile.countryCode.trim() ? { countryCode: profile.countryCode.trim() } : {}),
      ...(profile.timeZone.trim() ? { timeZone: profile.timeZone.trim() } : {}),
      ...(canManageFinance ? { defaultHourlyRate: Number(profile.defaultHourlyRate) || 0 } : {}),
      canTeachKinder: profile.canTeachKinder,
    };
    void sudoAction.run(() => create.mutateAsync(input), {
      onSuccess: (created) => {
        setSuccess(`${created.name} 강사를 등록했습니다.`);
        onCreated?.(created);
      },
      onError: (caught) => setError(apiErrorMessage(caught, '강사를 등록하지 못했습니다.')),
    });
  };

  return (
    <>
    <form className={`space-y-4 ${compact ? '' : 'p-4'}`} onSubmit={submit}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="로그인 아이디"><input className="input w-full" value={account.webId} onChange={(event) => setAccount({ ...account, webId: event.target.value })} minLength={WEB_ID_MIN} maxLength={50} required data-modal-autofocus={!compact ? 'true' : undefined} /></Field>
        <Field label="초기 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} required maxLength={72} /></Field>
        <Field label="비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" value={account.passwordConfirm} onChange={(event) => setAccount({ ...account, passwordConfirm: event.target.value })} required maxLength={72} /></Field>
      </div>
      {passwordError && <p className="text-caption text-danger" role="alert">{passwordError}</p>}
      {!!account.passwordConfirm && account.password !== account.passwordConfirm && <p className="text-caption text-danger" role="alert">비밀번호가 일치하지 않습니다.</p>}
      <InstructorProfileFields value={profile} onChange={setProfile} showHourlyRate={canManageFinance} />
      {englishNameError && <p className="text-caption text-danger" role="alert">{englishNameError}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && <span className="text-caption text-danger" role="alert">{error}</span>}
        {success && <span className="text-caption text-success" role="status">{success}</span>}
        <button type="submit" className="btn btn-primary" disabled={!canSubmit || create.isPending || sudoAction.isPending}>{create.isPending || sudoAction.isPending ? '등록 중…' : '강사 등록'}</button>
      </div>
      {!compact && <p className="text-caption text-fg-subtle">강사 프로필의 생성·변경·삭제는 감사 이력에 남습니다.</p>}
    </form>
    {sudoAction.modal}
    </>
  );
}
