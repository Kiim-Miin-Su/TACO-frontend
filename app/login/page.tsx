"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useTacoStore } from "@/lib/store";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import type { AccountRole } from "@/types";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const [webId, setWebId] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!webId.trim() || !password) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.auth.login({ webId: webId.trim(), password });
      setToken(res.accessToken);
      const accountRole = res.account.role as AccountRole;
      setCurrentRole(accountRole);
      setCurrentAccount({ id: res.account.id, name: res.account.name, role: accountRole });
      queryClient.clear(); // 로그인 계정/권한 변경 — 이전 역할의 서버 캐시 폐기
      router.replace(res.account.mustChangePassword ? "/account/security" : params.get("redirect") || "/");
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } } };
      setErr(ax.response?.data?.message ?? "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="로그인" subtitle="사내 담당자 전용 백오피스">
      <form onSubmit={submit} className="space-y-3.5">
        <AuthField label="아이디">
          <input className="input w-full" value={webId} onChange={(e) => setWebId(e.target.value)} placeholder="admin" autoFocus />
        </AuthField>
        <AuthField label="비밀번호">
          <input className="input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </AuthField>
        {err && <p className="text-caption text-danger">{err}</p>}
        <button className="btn btn-primary w-full h-10" disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
      </form>

      <div className="flex items-center justify-between text-caption text-fg-muted pt-1">
        <span>계정이 없으신가요?</span>
        <Link href="/signup" className="font-medium text-accent hover:underline">가입 신청 →</Link>
      </div>

      {/* [TBO-29] 테스트 계정 퀵셀렉트는 폐지. 모든 사용자는 자신의 자격증명으로 로그인한다. */}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
