"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useTacoStore } from "@/lib/store";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import type { AccountRole } from "@/types";

const DEMO = [
  { webId: "admin", label: "대표 · 김민수" },
  { webId: "manager", label: "매니저 · 이지원" },
  { webId: "park_inst", label: "강사 · 박지훈" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
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
      setCurrentRole(res.account.role as AccountRole);
      router.replace(params.get("redirect") || "/");
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

      <div className="border-t pt-3 border-line-muted">
        <div className="text-micro text-fg-subtle mb-1.5">데모 계정 (비밀번호: demo1234)</div>
        <div className="flex flex-wrap gap-1.5">
          {DEMO.map((d) => (
            <button key={d.webId} type="button" onClick={() => { setWebId(d.webId); setPassword("demo1234"); }}
              className="badge badge-neutral hover:bg-canvas-subtle" title={d.webId}>{d.label}</button>
          ))}
        </div>
      </div>
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
