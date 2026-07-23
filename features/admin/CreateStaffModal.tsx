'use client';
// [유저 관리 2026-07-20 대표 지시] 직접 등록 모달 — 리스트뷰 'Create' 분리 버튼 전용.
//  BE POST /users/instructors(역할 확장 07-20 — instructor|manager|admin, 즉시 active) 재사용.
//  재사용: ModalShell·useWebIdAvailable(가입 폼과 같은 공개 중복 라이브 체크·같은 문구)·
//  useDebouncedValue·passwordLengthError/isValidKrPhone(validation 단일 소스)·중앙 훅.
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3] 오류 파싱 단일 진실원
import { ModalShell } from '@/components/ui';
import { AuthField } from '@/components/auth/AuthShell';
import { roleLabel } from '@/lib/roles';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useCreateStaffUser, useWebIdAvailable } from '@/lib/queries';
import { WEB_ID_MIN, isValidKrPhone, passwordLengthError } from '@/lib/validation';

const ROLE_OPTS = ['instructor', 'manager', 'admin'] as const;

export function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const create = useCreateStaffUser();
  const [form, setForm] = useState({
    webId: '', name: '', password: '', passwordConfirm: '', role: 'instructor' as string,
    email: '', phone: '', university: '', major: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // 가입 폼과 동일한 중복 라이브 체크(500ms 디바운스·공개 체크 — 판정 불가 시 조용히 생략).
  const webIdTrimmed = form.webId.trim();
  const debouncedWebId = useDebouncedValue(webIdTrimmed, 500);
  const webIdQuery = useWebIdAvailable(debouncedWebId.length >= WEB_ID_MIN ? debouncedWebId : null);
  const webIdVerdict = debouncedWebId === webIdTrimmed && webIdQuery.data ? webIdQuery.data.available : null;

  const passwordError = form.password ? passwordLengthError(form.password) : null;
  const passwordsMatch = !!form.password && form.password === form.passwordConfirm;
  const canSubmit = webIdTrimmed.length >= WEB_ID_MIN && !!form.name.trim()
    && passwordsMatch && !passwordError && webIdVerdict !== false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || create.isPending) return;
    setErr(null);
    if (form.phone && !isValidKrPhone(form.phone)) {
      setErr('전화번호는 010-1234-5678 형식으로 입력해 주세요.');
      return;
    }
    create.mutate(
      {
        webId: webIdTrimmed, name: form.name.trim(), password: form.password, role: form.role,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.university.trim() ? { university: form.university.trim() } : {}),
        ...(form.major.trim() ? { major: form.major.trim() } : {}),
      },
      {
        onSuccess: (u) => onCreated(u.name),
        onError: (caught) => setErr(apiErrorMessage(caught, '등록하지 못했습니다.')),
      },
    );
  }

  return (
    <ModalShell title="계정 직접 등록 — 즉시 활성(이메일 인증 생략)" size="md" onClose={onClose}
      footer={(
        <>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={create.isPending || !canSubmit} onClick={submit as never}>
            {create.isPending ? '등록 중…' : '등록'}
          </button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <AuthField label="아이디 (3자 이상)">
            <input className="input w-full" value={form.webId} onChange={set('webId')} required minLength={WEB_ID_MIN} maxLength={50} autoFocus data-modal-autofocus="true" />
          </AuthField>
          <AuthField label="역할">
            <select className="input w-full" value={form.role} onChange={set('role')}>
              {ROLE_OPTS.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </AuthField>
        </div>
        {webIdVerdict === false && <p className="text-caption text-danger" role="alert">이미 사용 중인 아이디입니다.</p>}
        {webIdVerdict === true && <p className="text-caption text-success" role="status">사용 가능한 아이디입니다.</p>}
        <AuthField label="이름">
          <input className="input w-full" value={form.name} onChange={set('name')} required maxLength={50} />
        </AuthField>
        <div className="grid grid-cols-2 gap-2">
          <AuthField label="초기 비밀번호 (8자 이상)">
            <input className="input w-full" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required maxLength={72} />
          </AuthField>
          <AuthField label="비밀번호 확인">
            <input className="input w-full" type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={set('passwordConfirm')} required maxLength={72} />
          </AuthField>
        </div>
        {passwordError && <p className="text-caption text-danger" role="alert">{passwordError}</p>}
        {!!form.passwordConfirm && !passwordsMatch && <p className="text-caption text-danger" role="alert">비밀번호가 일치하지 않습니다.</p>}
        <div className="grid grid-cols-2 gap-2">
          <AuthField label="이메일 (선택)">
            <input className="input w-full" type="email" value={form.email} onChange={set('email')} maxLength={320} />
          </AuthField>
          <AuthField label="전화번호 (선택)">
            <input className="input w-full" type="tel" value={form.phone} onChange={set('phone')} placeholder="010-1234-5678" />
          </AuthField>
        </div>
        {form.role === 'instructor' && (
          <div className="grid grid-cols-2 gap-2">
            <AuthField label="대학교 (선택)">
              <input className="input w-full" value={form.university} onChange={set('university')} maxLength={100} />
            </AuthField>
            <AuthField label="전공 (선택)">
              <input className="input w-full" value={form.major} onChange={set('major')} maxLength={100} />
            </AuthField>
          </div>
        )}
        {err && <p className="text-caption text-danger" role="alert">{err}</p>}
        <p className="text-caption text-fg-subtle">직접 등록은 대표가 신원을 확인한 경우에만 사용하세요. 계정은 즉시 로그인 가능하며, 등록 이력은 감사 로그에 남습니다.</p>
      </form>
    </ModalShell>
  );
}
