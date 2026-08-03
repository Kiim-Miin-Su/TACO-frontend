"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTacoStore } from "@/lib/store";
import { apiErrorMessage } from "@/lib/api-error";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import { resolvePostLoginDestination } from "@/lib/navigation-security";
import { resolveBackofficeRole } from "@/lib/access-control";
import { clearAccountScopedClientState } from "@/lib/auth-session";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount); // [75B] currentRole 레거시 제거 — account.role 단일 진실원
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
      await clearAccountScopedClientState(queryClient);
      const claims = await api.auth.me();
      const accountRole = resolveBackofficeRole(claims.roles ?? []);
      if (!accountRole) throw new Error("BACKOFFICE_ROLE_REQUIRED");
      setCurrentAccount({
        id: claims.sub,
        name: claims.name,
        role: accountRole,
        mustChangePassword: claims.mustChangePassword === true,
        accessVersion: claims.accessVersion,
        effectiveCapabilities: claims.effectiveCapabilities,
      });
      router.replace(resolvePostLoginDestination(
        params.get("redirect"),
        accountRole,
        claims.mustChangePassword === true,
      ));
    } catch (e) {
      // [E0.6 L 2026-07-16] 서버 원문(영문 프레임워크 메시지·프록시 HTML 등) 노출 방지 —
      //  BE 로그인 메시지는 한글이므로 한글이면 그대로, 아니면 상태코드별 한글 안내로 매핑.
      const serverMsg = apiErrorMessage(e, ""); // [75A] SSOT 파싱(빈값=서버 message 없음)
      const status = (e as { response?: { status?: number } }).response?.status;
      setErr(
        serverMsg && /[가-힣]/.test(serverMsg)
          ? serverMsg
          : status === 401 ? "아이디 또는 비밀번호가 올바르지 않습니다."
            : status === 429 ? "로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요."
              : status != null && status >= 500 ? "서버 오류로 로그인하지 못했습니다. 잠시 후 다시 시도해 주세요."
                : "로그인하지 못했습니다. 네트워크 연결을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="로그인" subtitle="사내 담당자 전용 백오피스">
      <form onSubmit={submit} className="space-y-3.5">
        <AuthField label="아이디">
          <input className="input w-full" value={webId} onChange={(e) => setWebId(e.target.value)} autoFocus />
        </AuthField>
        <AuthField label="비밀번호">
          <input className="input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
        </AuthField>
        {err && <p className="text-caption text-danger">{err}</p>}
        <button className="btn btn-primary w-full h-10" disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
      </form>

      <div className="flex items-center justify-between text-caption text-fg-muted pt-1">
        <span>계정이 없으신가요?</span>
        <Link href="/signup" className="font-medium text-accent hover:underline">가입 신청 →</Link>
      </div>
      {/* [TBO-29C C5] 비로그인 복구 — 아이디 찾기·비밀번호 재설정 */}
      <div className="flex items-center justify-center gap-2 text-caption text-fg-muted">
        <Link href="/recover" className="hover:underline">아이디 찾기</Link>
        <span aria-hidden>·</span>
        <Link href="/recover?tab=password" className="hover:underline">비밀번호 재설정</Link>
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
