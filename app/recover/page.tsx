// [TBO-29C C5] 비로그인 복구 — 아이디 찾기 / 비밀번호 재설정 요청.
//  응답은 계정 존재와 무관하게 동일(열거 방지) — 성공 화면도 동일 문구를 그대로 보여준다.
//  dev(무SMTP)에서는 서버가 devWebId/devResetUrl을 돌려주므로 화면에 개발용 힌트를 함께 표기한다.
"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";

function RecoverForm() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"id" | "password">(params.get("tab") === "password" ? "password" : "id");
  const [email, setEmail] = useState("");
  const [webId, setWebId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setDone(null); setDevHint(null);
    try {
      if (tab === "id") {
        const res = await api.auth.recoverId(email.trim());
        setDone(res.message);
        if (res.devWebId) setDevHint(`개발 모드 안내: 아이디 = ${res.devWebId}`);
      } else {
        const res = await api.auth.recoverPassword(webId.trim(), email.trim());
        setDone(res.message);
        if (res.devResetUrl) setDevHint(`개발 모드 재설정 링크: ${res.devResetUrl}`);
      }
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const m = ax.response?.data?.message;
      setErr(Array.isArray(m) ? m[0] : m ?? "요청에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="계정 찾기" subtitle="가입 이메일로 본인 확인 후 안내해 드립니다">
      <div className="flex rounded-md overflow-hidden border mb-3">
        {([["id", "아이디 찾기"], ["password", "비밀번호 재설정"]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => { setTab(v); setDone(null); setDevHint(null); setErr(null); }}
            className={`btn btn-sm flex-1 rounded-none border-0 ${tab === v ? "badge-accent" : ""}`}>{label}</button>
        ))}
      </div>
      {done ? (
        <div className="space-y-3">
          <p className="text-body">{done}</p>
          {devHint && <p className="text-caption text-accent break-all">{devHint}</p>}
          <p className="text-caption text-fg-muted">메일이 오지 않으면 스팸함을 확인하거나 입력 정보를 다시 확인해 주세요.</p>
          <Link href="/login" className="btn btn-primary w-full h-10 grid place-items-center">로그인으로 돌아가기</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3.5">
          {tab === "password" && (
            <AuthField label="아이디">
              <input className="input w-full" value={webId} onChange={(e) => setWebId(e.target.value)} placeholder="아이디" autoFocus />
            </AuthField>
          )}
          <AuthField label="가입 이메일">
            <input className="input w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus={tab === "id"} />
          </AuthField>
          {err && <p className="text-caption text-danger">{err}</p>}
          <button className="btn btn-primary w-full h-10" disabled={busy || !email.trim() || (tab === "password" && !webId.trim())}>
            {busy ? "요청 중…" : tab === "id" ? "아이디 안내 메일 받기" : "재설정 링크 받기"}
          </button>
        </form>
      )}
      <div className="flex items-center justify-center text-caption text-fg-muted pt-1">
        <Link href="/login" className="hover:underline">← 로그인</Link>
      </div>
    </AuthShell>
  );
}

export default function RecoverPage() {
  return (
    <Suspense fallback={null}>
      <RecoverForm />
    </Suspense>
  );
}
