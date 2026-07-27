'use client';

import { useState, type FormEvent } from 'react';
import { apiErrorMessage } from '@/lib/api-error';
import { ModalShell } from './Modal';

export function SudoActionModal({
  pending,
  error,
  onClose,
  onSubmit,
  title = '본인 확인',
  message = '보호된 작업을 계속하려면 현재 비밀번호를 입력해 주세요.',
}: {
  pending: boolean;
  error: unknown | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
  title?: string;
  message?: string;
}) {
  const [password, setPassword] = useState('');
  const errorMessage = error
    ? apiErrorMessage(error, '비밀번호를 확인하지 못했습니다. 다시 입력해 주세요.')
    : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password || pending) return;
    onSubmit(password);
  };

  return (
    <ModalShell
      title={title}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-sm" type="button" disabled={pending} onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" type="submit" form="sudo-action-form" disabled={pending || !password}>
            {pending ? '확인 중...' : '확인하고 계속'}
          </button>
        </>
      )}
    >
      <form id="sudo-action-form" className="space-y-3" onSubmit={submit}>
        <p className="text-body text-fg-muted">{message}</p>
        <label className="block">
          <span className="mb-1 block text-caption font-medium text-fg-muted">현재 비밀번호</span>
          <input
            className="input w-full"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            required
            disabled={pending}
            data-modal-autofocus="true"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {errorMessage && <p className="text-caption text-danger" role="alert">{errorMessage}</p>}
      </form>
    </ModalShell>
  );
}
