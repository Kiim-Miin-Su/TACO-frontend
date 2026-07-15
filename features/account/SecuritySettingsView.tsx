"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { clearToken, currentClaims } from "@/lib/auth";
import { useTacoStore } from "@/lib/store";

export default function SecuritySettingsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const forced = currentClaims()?.mustChangePassword === true;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newWebId, setNewWebId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // [E0.5 ⑥ 대표 지시 2026-07-15] 첫 로그인 강제 변경에서 가입 폼처럼 프로필까지 한 번에 —
  //  이름(토큰 claim으로 프리필)·이메일·휴대폰. 서버는 강제 변경 흐름에서만 이 필드를 받는다.
  const [name, setName] = useState(currentClaims()?.name ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function logout() {
    clearToken();
    setCurrentAccount(null);
    queryClient.clear();
    router.replace("/login");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const nextWebId = newWebId.trim();
    if (!currentPassword) return setError("현재 비밀번호를 입력해 주세요.");
    if (forced && (!nextWebId || !newPassword)) return setError("첫 로그인에서는 새 아이디와 새 비밀번호를 모두 입력해 주세요.");
    if (!forced && !nextWebId && !newPassword) return setError("새 아이디 또는 새 비밀번호를 입력해 주세요.");
    if (newPassword && newPassword !== confirmPassword) return setError("새 비밀번호 확인이 일치하지 않습니다.");
    if (newPassword && new TextEncoder().encode(newPassword).length < 8) return setError("새 비밀번호는 8바이트 이상이어야 합니다.");
    if (newPassword && new TextEncoder().encode(newPassword).length > 72) return setError("새 비밀번호는 72바이트 이하여야 합니다.");
    // [E0.5 ⑥] 강제 변경 흐름의 프로필 검증 — 가입 폼과 동일 규칙(이메일 형식·전화 010-1234-5678).
    if (forced) {
      if (!name.trim()) return setError("이름을 입력해 주세요.");
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("이메일 형식이 올바르지 않습니다.");
      if (!phone.trim() || !/^\d{2,3}-\d{3,4}-\d{4}$/.test(phone.trim())) return setError("전화번호는 010-1234-5678 형식으로 입력해 주세요.");
    }
    setBusy(true);
    try {
      await api.account.changeCredentials({
        currentPassword,
        ...(nextWebId ? { newWebId: nextWebId } : {}),
        ...(newPassword ? { newPassword } : {}),
        ...(forced ? { name: name.trim(), email: email.trim(), phone: phone.trim() } : {}),
      });
      clearToken();
      setCurrentAccount(null);
      queryClient.clear();
      router.replace("/login?credentialsChanged=1");
    } catch (caught) {
      const error = caught as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message ?? "계정 정보를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <PageHeader title="계정 보안" sub={forced ? "첫 로그인입니다. 계정 정보를 한 번에 설정해 주세요." : "아이디 또는 비밀번호를 변경합니다."} />
      <form className="card card-pad space-y-4" onSubmit={submit}>
        <Field label="현재 비밀번호"><input className="input w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus /></Field>
        <Field label="새 아이디"><input className="input w-full" autoComplete="username" required={forced} minLength={3} maxLength={50} value={newWebId} onChange={(e) => setNewWebId(e.target.value)} /></Field>
        <Field label="새 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" required={forced} maxLength={72} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <Field label="새 비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" required={forced || Boolean(newPassword)} maxLength={72} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        {forced && (
          <>
            {/* [E0.5 ⑥ 대표 지시] 가입 폼 재사용 — 첫 로그인에서 프로필(이름·이메일·휴대폰)까지 한 번에 */}
            <div className="border-t pt-4 space-y-4">
              <p className="text-caption text-fg-muted">프로필 정보 — 비밀번호 찾기·알림 수신에 사용됩니다.</p>
              <Field label="이름"><input className="input w-full" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="김민선" /></Field>
              <Field label="이메일"><input className="input w-full" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@tnacademy.com" /></Field>
              <Field label="휴대폰"><input className="input w-full" type="tel" autoComplete="tel" required maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></Field>
            </div>
          </>
        )}
        {error && <p className="text-body text-danger" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn" onClick={logout} disabled={busy}>로그아웃</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "변경 중..." : forced ? "계정 정보 설정 완료" : "계정 정보 변경"}</button>
        </div>
      </form>
    </div>
  );
}
