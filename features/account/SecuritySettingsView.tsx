"use client";

// [E0 2026-07-15] 계정 보안 — 두 흐름의 화면.
//  · 첫 로그인 강제 변경(forced): 아이디+비밀번호+프로필(이름·이메일·휴대폰) 통합 설정(E0.5 ⑥).
//    부트스트랩 컨텍스트라 이메일 OTP는 예외.
//  · 평시(비강제): 비밀번호 변경만 — 현재 비밀번호 재확인 + **본인 이메일 OTP** 소비(대표 참고사항).
//    아이디 변경은 마이 페이지의 프로필 변경 요청(승인제)로 이동 — 안내만 표시.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, Field } from "@/components/ui";
import { api, type ProfileVerification } from "@/lib/api";
import { clearToken, currentClaims } from "@/lib/auth";
import { resetPreferences } from "@/lib/storage/preferences";
import { useTacoStore } from "@/lib/store";

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
};

export default function SecuritySettingsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const forced = currentClaims()?.mustChangePassword === true;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newWebId, setNewWebId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // [E0.5 ⑥] 첫 로그인 강제 변경에서 가입 폼처럼 프로필까지 한 번에 — 이름(claim 프리필)·이메일·휴대폰.
  const [name, setName] = useState(currentClaims()?.name ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // [E0] 평시 비밀번호 변경용 본인 이메일 OTP — 발송→코드 확인→verified 후 제출 시 소비.
  const [otp, setOtp] = useState<ProfileVerification | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function logout() {
    clearToken();
    setCurrentAccount(null);
    queryClient.clear();
    resetPreferences(); // [E0 storage 감사] 계정 간 취향 preference 누출 차단
    router.replace("/login");
  }

  async function sendOtp() {
    setError(null);
    setNotice(null);
    if (!currentPassword) return setError("인증 코드 발송에는 현재 비밀번호가 필요합니다. 먼저 입력해 주세요.");
    setBusy(true);
    try {
      // 대상은 항상 **본인 계정의 현재 이메일** — 서버가 프로필에서 확인하므로 값 입력을 받지 않는다.
      const me = await api.account.profile();
      if (!me.email) {
        setError("등록된 이메일이 없습니다. 마이 페이지에서 이메일을 먼저 등록해 주세요.");
        return;
      }
      const challenge = await api.profileVerifications.create({
        currentPassword,
        channel: "email",
        target: me.email,
      });
      setOtp(challenge);
      setOtpCode("");
      setOtpVerified(false);
      setNotice(`${challenge.maskedTarget}(으)로 인증 코드를 보냈습니다.`);
    } catch (caught) {
      setError(apiErrorMessage(caught, "인증 코드를 발송하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!otp) return;
    setError(null);
    setNotice(null);
    if (!/^\d{4,10}$/.test(otpCode.trim())) return setError("인증 코드는 4~10자리 숫자입니다.");
    setBusy(true);
    try {
      await api.profileVerifications.confirm(otp.id, otpCode.trim());
      setOtpVerified(true);
      setNotice("이메일 인증 완료 — 이제 비밀번호를 변경할 수 있습니다.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "인증 코드를 확인하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const nextWebId = newWebId.trim();
    if (!currentPassword) return setError("현재 비밀번호를 입력해 주세요.");
    if (forced && (!nextWebId || !newPassword)) return setError("첫 로그인에서는 새 아이디와 새 비밀번호를 모두 입력해 주세요.");
    if (!forced && !newPassword) return setError("새 비밀번호를 입력해 주세요.");
    if (newPassword && newPassword !== confirmPassword) return setError("새 비밀번호 확인이 일치하지 않습니다.");
    if (newPassword && new TextEncoder().encode(newPassword).length < 8) return setError("새 비밀번호는 8바이트 이상이어야 합니다.");
    if (newPassword && new TextEncoder().encode(newPassword).length > 72) return setError("새 비밀번호는 72바이트 이하여야 합니다.");
    // [E0.5 ⑥] 강제 변경 흐름의 프로필 검증 — 가입 폼과 동일 규칙(이메일 형식·전화 010-1234-5678).
    if (forced) {
      if (!name.trim()) return setError("이름을 입력해 주세요.");
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("이메일 형식이 올바르지 않습니다.");
      if (!phone.trim() || !/^\d{2,3}-\d{3,4}-\d{4}$/.test(phone.trim())) return setError("전화번호는 010-1234-5678 형식으로 입력해 주세요.");
    }
    // [E0] 평시 비밀번호 변경 = 본인 이메일 OTP 필수(서버도 동일 검증 — 소비는 같은 tx).
    if (!forced && (!otp || !otpVerified)) {
      return setError("본인 이메일 인증을 먼저 완료해 주세요. (인증 코드 발송 → 코드 확인)");
    }
    setBusy(true);
    try {
      await api.account.changeCredentials({
        currentPassword,
        ...(forced && nextWebId ? { newWebId: nextWebId } : {}),
        ...(newPassword ? { newPassword } : {}),
        ...(forced ? { name: name.trim(), email: email.trim(), phone: phone.trim() } : {}),
        ...(!forced && otp ? { verificationChallengeId: otp.id } : {}),
      });
      clearToken();
      setCurrentAccount(null);
      queryClient.clear();
      resetPreferences(); // [E0 storage 감사] 자격증명 변경 후 재로그인 전 정리
      router.replace("/login?credentialsChanged=1");
    } catch (caught) {
      setError(apiErrorMessage(caught, "계정 정보를 변경하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <PageHeader
        title="계정 보안"
        sub={forced ? "첫 로그인입니다. 계정 정보를 한 번에 설정해 주세요." : "비밀번호를 변경합니다. (본인 이메일 인증 필요)"}
      />
      <form className="card card-pad space-y-4" onSubmit={submit}>
        <Field label="현재 비밀번호"><input className="input w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus /></Field>
        {forced ? (
          <Field label="새 아이디"><input className="input w-full" autoComplete="username" required minLength={3} maxLength={50} value={newWebId} onChange={(e) => setNewWebId(e.target.value)} /></Field>
        ) : (
          // [E0] 평시 아이디 변경은 승인제 — 마이 페이지의 프로필 변경 요청으로 이동.
          <p className="text-caption text-fg-muted">
            아이디 변경은 <Link href="/account" className="text-accent hover:underline">마이 페이지 → 프로필 변경</Link>에서
            요청할 수 있습니다(대표 승인 후 적용 · 재로그인 필요).
          </p>
        )}
        <Field label="새 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" required maxLength={72} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <Field label="새 비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" required maxLength={72} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        {forced ? (
          <div className="border-t pt-4 space-y-4">
            {/* [E0.5 ⑥ 대표 지시] 가입 폼 재사용 — 첫 로그인에서 프로필(이름·이메일·휴대폰)까지 한 번에 */}
            <p className="text-caption text-fg-muted">프로필 정보 — 비밀번호 찾기·알림 수신에 사용됩니다.</p>
            <Field label="이름"><input className="input w-full" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="김민선" /></Field>
            <Field label="이메일"><input className="input w-full" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@tnacademy.com" /></Field>
            <Field label="휴대폰"><input className="input w-full" type="tel" autoComplete="tel" required maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></Field>
          </div>
        ) : (
          <div className="border-t pt-4 space-y-3">
            {/* [E0] 본인 이메일 OTP — 등록된 이메일로 발송(대상 입력 없음), verified 후 제출 가능 */}
            <p className="text-caption text-fg-muted">본인 확인 — 등록된 이메일로 인증 코드를 받아 입력해 주세요.</p>
            {otpVerified ? (
              <p className="text-body text-success" role="status">이메일 인증 완료</p>
            ) : otp ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="인증 코드">
                    <input
                      className="input w-full mono tracking-widest"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={10}
                      placeholder="6자리 숫자"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                </div>
                <button type="button" className="btn btn-sm shrink-0" onClick={confirmOtp} disabled={busy}>코드 확인</button>
                <button type="button" className="btn btn-sm shrink-0" onClick={sendOtp} disabled={busy}>재전송</button>
              </div>
            ) : (
              <button type="button" className="btn btn-sm" onClick={sendOtp} disabled={busy}>
                {busy ? "발송 중..." : "인증 코드 발송"}
              </button>
            )}
          </div>
        )}
        {notice && <p className="text-caption text-success" role="status">{notice}</p>}
        {error && <p className="text-body text-danger" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn" onClick={logout} disabled={busy}>로그아웃</button>
          <button className="btn btn-primary" disabled={busy || (!forced && !otpVerified)}>
            {busy ? "변경 중..." : forced ? "계정 정보 설정 완료" : "비밀번호 변경"}
          </button>
        </div>
      </form>
    </div>
  );
}
