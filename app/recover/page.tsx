// [TBO-31 C5 2026-07-20] 비로그인 복구 — 인라인 OTP판(29C 링크판 대체·링크 랜딩 /reset-password는 유지).
//  · 아이디 찾기: 이메일 OTP 인증 → 화면에 webId 즉시 표시(메일 왕복 제거, challenge 일회 소비).
//  · 비밀번호 재설정: 아이디+이메일 OTP+새 비밀번호(확인란) → 즉시 변경(기존 세션 전부 무효).
//  결과는 이메일 소유를 OTP로 증명한 뒤에만 노출(열거 아님 — TBO-31 §6 D8/D9).
//  쓰기는 중앙 훅(lib/queries — CLAUDE.md §18-2)·비밀번호 검증은 lib/validation 단일 소스(§18-3).
"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import { EmailOtpField } from "@/features/auth/EmailOtpField";
import { useCompleteRecoverId, useResetPasswordOtp } from "@/lib/queries";
import { WEB_ID_MIN, passwordLengthError } from "@/lib/validation";

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
};

// ── 아이디 찾기 — OTP 인증 후 완료 버튼 → webId 목록 화면 표시 ────────────────
function RecoverIdTab() {
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [webIds, setWebIds] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const complete = useCompleteRecoverId();

  function reveal() {
    if (challengeId == null || complete.isPending) return;
    setErr(null);
    complete.mutate(
      { challengeId, email: email.trim().toLowerCase() },
      {
        onSuccess: (res) => setWebIds(res.webIds),
        onError: (caught) => setErr(apiErrorMessage(caught, "아이디를 확인하지 못했습니다. 처음부터 다시 시도해 주세요.")),
      },
    );
  }

  if (webIds != null) {
    return (
      <div className="space-y-3">
        {webIds.length > 0 ? (
          <>
            <p className="text-body">이 이메일로 가입된 아이디입니다.</p>
            <ul className="space-y-1">
              {webIds.map((id) => (
                <li key={id} className="rounded-lg p-3 bg-canvas-subtle mono font-medium">{id}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body">이 이메일로 가입된 계정이 없습니다. 이메일을 다시 확인하거나 가입 신청을 진행해 주세요.</p>
        )}
        <Link href="/login" className="btn btn-primary w-full h-10 grid place-items-center">로그인으로 →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EmailOtpField
        email={email}
        onEmailChange={setEmail}
        verifiedChallengeId={challengeId}
        onVerifiedChange={setChallengeId}
        purpose="recovery"
        verifiedLabel="이메일 인증 완료 — 아래에서 아이디를 확인하세요."
      />
      {err && <p className="text-caption text-danger" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary w-full h-10" onClick={reveal} disabled={challengeId == null || complete.isPending}>
        {complete.isPending ? "확인 중…" : "아이디 확인"}
      </button>
      {challengeId == null && (
        <p className="text-caption text-fg-subtle">가입 이메일을 인증하면 아이디를 바로 확인할 수 있습니다.</p>
      )}
    </div>
  );
}

// ── 비밀번호 재설정 — 아이디+OTP+새 비밀번호(확인란) → 즉시 변경 ───────────────
function ResetPasswordTab() {
  const [webId, setWebId] = useState("");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = useResetPasswordOtp();

  // 가입 폼과 동일 규칙·동일 문구(lib/validation 단일 소스).
  const passwordError = password ? passwordLengthError(password) : null;
  const passwordMismatch = !!passwordConfirm && password !== passwordConfirm;
  const canSubmit =
    challengeId != null && webId.trim().length >= WEB_ID_MIN &&
    !!password && password === passwordConfirm && !passwordError;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || reset.isPending) return;
    setErr(null);
    reset.mutate(
      { challengeId: challengeId as number, webId: webId.trim(), email: email.trim().toLowerCase(), newPassword: password },
      {
        onSuccess: () => setDone(true),
        onError: (caught) => setErr(apiErrorMessage(caught, "비밀번호를 재설정하지 못했습니다. 입력 정보를 확인해 주세요.")),
      },
    );
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg p-3 text-body bg-canvas-subtle">비밀번호가 변경되었습니다. 기존 로그인 세션은 모두 종료되었습니다.</div>
        <Link href="/login" className="btn btn-primary w-full h-10 grid place-items-center">새 비밀번호로 로그인 →</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <AuthField label="아이디">
        <input className="input w-full" value={webId} onChange={(e) => setWebId(e.target.value)} placeholder="아이디" required minLength={WEB_ID_MIN} maxLength={50} autoFocus />
      </AuthField>
      <EmailOtpField
        email={email}
        onEmailChange={setEmail}
        verifiedChallengeId={challengeId}
        onVerifiedChange={setChallengeId}
        purpose="recovery"
        verifiedLabel="이메일 인증 완료 — 새 비밀번호를 설정하세요."
      />
      <AuthField label="새 비밀번호 (8자 이상)">
        <input className="input w-full" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required maxLength={72} />
      </AuthField>
      {passwordError && <p className="text-caption text-danger" role="alert">{passwordError}</p>}
      <AuthField label="새 비밀번호 확인">
        <input className="input w-full" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" required maxLength={72} />
      </AuthField>
      {passwordMismatch && <p className="text-caption text-danger" role="alert">비밀번호가 일치하지 않습니다.</p>}
      {err && <p className="text-caption text-danger" role="alert">{err}</p>}
      <button className="btn btn-primary w-full h-10" disabled={reset.isPending || !canSubmit}>
        {reset.isPending ? "변경 중…" : "비밀번호 변경"}
      </button>
      {challengeId == null && (
        <p className="text-caption text-fg-subtle">아이디 확인 후 가입 이메일 인증을 완료해야 변경할 수 있습니다.</p>
      )}
    </form>
  );
}

function RecoverForm() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"id" | "password">(params.get("tab") === "password" ? "password" : "id");

  return (
    <AuthShell title="계정 찾기" subtitle="가입 이메일 인증(OTP) 후 바로 확인·변경합니다">
      <div className="flex rounded-md overflow-hidden border mb-3">
        {([["id", "아이디 찾기"], ["password", "비밀번호 재설정"]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setTab(v)}
            className={`btn btn-sm flex-1 rounded-none border-0 ${tab === v ? "badge-accent" : ""}`}>{label}</button>
        ))}
      </div>
      {/* 탭 전환 시 상태 초기화 — key 리마운트(진행 중 challenge는 서버 TTL로 자연 만료) */}
      {tab === "id" ? <RecoverIdTab key="id" /> : <ResetPasswordTab key="password" />}
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
