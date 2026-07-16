// [TBO-29C C5] 비밀번호 재설정 확정 — 메일 링크(?token=)로 진입. 성공 시 기존 세션 전부 무효(auth_version+1).
"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
// [B6 C2] 비밀번호 길이를 byte 기준 단일 소스로 — 계정 보안 화면과 규칙 불일치(char 기준) 정정.
import { PASSWORD_MIN_BYTES, passwordByteLength, passwordLengthError } from "@/lib/validation";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const lengthError = passwordLengthError(pw);
    if (!token || pw !== pw2) return;
    if (lengthError) { setErr(lengthError); return; }
    setBusy(true); setErr(null);
    try {
      await api.auth.resetPassword(token, pw);
      setDone(true);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const m = ax.response?.data?.message;
      setErr(Array.isArray(m) ? m[0] : m ?? "재설정에 실패했습니다. 링크를 다시 요청해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="비밀번호 재설정" subtitle="링크가 올바르지 않습니다">
        <p className="text-body">재설정 링크가 유효하지 않습니다. 메일의 링크로 다시 접속하거나 새 링크를 요청해 주세요.</p>
        <Link href="/recover?tab=password" className="btn btn-primary w-full h-10 grid place-items-center mt-3">재설정 링크 다시 받기</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="비밀번호 재설정" subtitle="새 비밀번호를 입력하세요 (8자 이상)">
      {done ? (
        <div className="space-y-3">
          <p className="text-body">비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.</p>
          <p className="text-caption text-fg-muted">보안을 위해 기존 로그인 세션은 모두 종료되었습니다.</p>
          <Link href="/login" className="btn btn-primary w-full h-10 grid place-items-center">로그인하기</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3.5">
          <AuthField label="새 비밀번호">
            <input className="input w-full" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8자 이상" autoFocus autoComplete="new-password" />
          </AuthField>
          <AuthField label="새 비밀번호 확인">
            <input className="input w-full" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더 입력" autoComplete="new-password" />
          </AuthField>
          {mismatch && <p className="text-caption text-danger">비밀번호가 일치하지 않습니다.</p>}
          {err && <p className="text-caption text-danger">{err}</p>}
          <button className="btn btn-primary w-full h-10" disabled={busy || passwordByteLength(pw) < PASSWORD_MIN_BYTES || pw !== pw2}>
            {busy ? "변경 중…" : "비밀번호 변경"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
