"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { AuthShell } from "@/components/auth/AuthShell";

function Verify() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("error"); setMsg("인증 토큰이 없습니다."); return; }
    api.auth.verifyEmail(token)
      .then((r) => { setState("ok"); setMsg(r.message); })
      .catch((e) => { setState("error"); setMsg(e?.response?.data?.message ?? "인증에 실패했습니다."); });
  }, [token]);

  return (
    <AuthShell title="이메일 인증" subtitle="가입 인증 처리">
      <div className="space-y-4">
        {state === "loading" && <p className="text-[13px] text-fg-muted">인증 처리 중…</p>}
        {state === "ok" && (
          <div className="rounded-lg p-3 text-[13px]" style={{ background: "var(--color-canvas-subtle)", color: "var(--color-success)" }}>✓ {msg}</div>
        )}
        {state === "error" && (
          <div className="rounded-lg p-3 text-[13px] text-danger" style={{ background: "var(--color-canvas-subtle)" }}>{msg}</div>
        )}
        <Link href="/login" className="btn btn-primary w-full h-10">로그인으로 →</Link>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}
