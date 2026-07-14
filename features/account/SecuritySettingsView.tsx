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
    setBusy(true);
    try {
      await api.account.changeCredentials({
        currentPassword,
        ...(nextWebId ? { newWebId: nextWebId } : {}),
        ...(newPassword ? { newPassword } : {}),
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
      <PageHeader title="계정 보안" sub={forced ? "첫 로그인입니다. 새 아이디와 비밀번호를 설정해 주세요." : "아이디 또는 비밀번호를 변경합니다."} />
      <form className="card card-pad space-y-4" onSubmit={submit}>
        <Field label="현재 비밀번호"><input className="input w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus /></Field>
        <Field label="새 아이디"><input className="input w-full" autoComplete="username" required={forced} minLength={3} maxLength={50} value={newWebId} onChange={(e) => setNewWebId(e.target.value)} /></Field>
        <Field label="새 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" required={forced} maxLength={72} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <Field label="새 비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" required={forced || Boolean(newPassword)} maxLength={72} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        {error && <p className="text-body text-danger" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn" onClick={logout} disabled={busy}>로그아웃</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "변경 중..." : forced ? "아이디와 비밀번호 변경" : "계정 정보 변경"}</button>
        </div>
      </form>
    </div>
  );
}
