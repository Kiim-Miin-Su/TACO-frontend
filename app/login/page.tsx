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
  { role: "대표", name: "김민수", webId: "admin", password: "demo1234" },
  { role: "매니저", name: "이지원", webId: "manager", password: "demo1234" },
  { role: "강사", name: "박지훈", webId: "park_inst", password: "demo1234" },
  { role: "강사", name: "정유진", webId: "jung_inst", password: "demo1234" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const clearRoleOverride = useTacoStore((s) => s.clearRoleOverride); // [임시/실험용] 새 로그인 시 오버라이드 해제
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
      clearRoleOverride(); // [임시/실험용] 이전 세션의 역할 오버라이드 무시하고 실제 계정 역할로
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
        <div className="text-caption font-medium text-fg-muted mb-2">테스트 계정</div>
        <div className="overflow-hidden rounded-md border border-line-muted">
          {DEMO.map((d) => (
            <button
              key={d.webId}
              type="button"
              onClick={() => { setWebId(d.webId); setPassword(d.password); }}
              className="grid w-full grid-cols-[64px_1fr] gap-x-3 border-b border-line-muted px-3 py-2 text-left text-caption last:border-b-0 hover:bg-canvas-subtle"
              title={`${d.webId} / ${d.password}`}
            >
              <span className="font-medium text-fg-muted">{d.role}</span>
              <span className="min-w-0">
                <span className="block font-medium text-fg">{d.name}</span>
                <span className="block text-fg-subtle">
                  ID <span className="mono text-fg-muted">{d.webId}</span>
                  <span className="px-1.5">·</span>
                  PW <span className="mono text-fg-muted">{d.password}</span>
                </span>
              </span>
            </button>
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
