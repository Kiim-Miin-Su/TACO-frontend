"use client";
// [TBO-31 C2 2026-07-16] 가입 폼 강화 — ① 비밀번호 확인란 ② 아이디 중복 라이브 체크(500ms 디바운스)
//  ③ 가입 전 이메일 OTP(EmailOtpField — 인증해야 submit 활성) ④ 출생연도 → 주민등록번호(수집 목적
//  고지·형식은 lib/validation.isValidRrn 단일 소스) ⑤ done 화면 = 이메일 인증 완료 전제(대표 승인
//  대기 안내만 — devVerifyLink 소멸). 쓰기는 중앙 훅(useSignup — CLAUDE.md §18-2).
import { useRef, useState } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { EmailOtpField } from "@/features/auth/EmailOtpField";
import {
  firstSignupIssue,
  signupFieldForApiMessage,
  type SignupField,
  type SignupIssue,
} from "@/lib/domain/signup-form";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { logger } from "@/lib/log";
import { useSignup, useWebIdAvailable } from "@/lib/queries";
// [B6 C2] 검증 규칙 단일 소스 — 전화·비밀번호 byte·주민등록번호(계정 보안 화면과 같은 규칙·같은 문구).
import { WEB_ID_MIN, passwordLengthError } from "@/lib/validation";

const ROLE_OPTIONS = [
  { value: "instructor", label: "강사" },
  { value: "manager", label: "매니저" },
  { value: "admin", label: "관리자" },
];

const signupLog = logger("signup");

type SignupFormError = { message: string; field: SignupField | null };

const apiErrorDetails = (caught: unknown): { message: string; status: number | null } => {
  const apiError = caught as { response?: { status?: number; data?: { message?: string | string[] } } };
  const rawMessage = apiError.response?.data?.message;
  return {
    message: Array.isArray(rawMessage) ? rawMessage.join(" ") : rawMessage ?? "가입 신청에 실패했습니다.",
    status: apiError.response?.status ?? null,
  };
};

export default function SignupPage() {
  // [E0.5 ④b] 대표 기대 필드 확장 — 전화·대학·전공(승인 판단 근거, 2026-07-15 QA에서 부재 확인).
  const [form, setForm] = useState({
    webId: "", name: "", email: "", password: "", passwordConfirm: "", role: "instructor",
    phone: "", university: "", major: "", rrn: "",
  });
  // [TBO-31 C2] 가입 전 이메일 OTP — 인증 완료 challenge id(이메일 수정 시 EmailOtpField가 무효화).
  const [emailChallengeId, setEmailChallengeId] = useState<number | null>(null);
  const [done, setDone] = useState<{ message: string } | null>(null);
  const [formError, setFormError] = useState<SignupFormError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const signup = useSignup();
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFormError((current) => current?.field === field ? null : current);
  };

  // [TBO-31 C2] 아이디 중복 라이브 체크 — 500ms 디바운스 공개 체크(web-id-available).
  //  429/400은 조용히 무시(표시 없음·게이트는 '중복 확정'만 차단) — 최종 판정은 submit 시 서버.
  const webIdTrimmed = form.webId.trim();
  const debouncedWebId = useDebouncedValue(webIdTrimmed, 500);
  const webIdQuery = useWebIdAvailable(debouncedWebId.length >= WEB_ID_MIN ? debouncedWebId : null);
  const webIdVerdict = debouncedWebId === webIdTrimmed && webIdQuery.data ? webIdQuery.data.available : null;

  // [TBO-31 C2] 비밀번호 확인 — 불일치 인라인·byte 검증은 기존 passwordLengthError(단일 문구).
  const passwordError = form.password ? passwordLengthError(form.password) : null;
  const passwordMismatch = !!form.passwordConfirm && form.password !== form.passwordConfirm;
  const passwordsMatch = !!form.password && form.password === form.passwordConfirm;

  // [TBO-31 C2] submit 게이트 — 이메일 인증 완료 + 중복 아님(중복 확정만 차단) + 비밀번호 일치.
  const canSubmit = emailChallengeId != null && webIdVerdict !== false && passwordsMatch && !passwordError;
  const busy = signup.isPending;

  function focusField(field: SignupField) {
    window.requestAnimationFrame(() => {
      const control = formRef.current?.elements.namedItem(field);
      if (!(control instanceof HTMLElement)) return;
      control.focus({ preventScroll: true });
      control.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function rejectLocally(issue: SignupIssue) {
    setFormError({ message: issue.message, field: issue.field });
    signupLog.debug("submit_blocked", { reason: issue.code, field: issue.field });
    focusField(issue.field);
  }

  function handleVerifiedChange(challengeId: number | null) {
    setEmailChallengeId(challengeId);
    setFormError((current) => current?.field === "email" ? null : current);
    if (challengeId != null) focusField("password");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const issue = firstSignupIssue({ form, emailChallengeId, webIdVerdict });
    if (issue) return rejectLocally(issue);
    if (emailChallengeId == null) return; // firstSignupIssue 통과 후의 타입 불변식

    signupLog.debug("submit_started", { emailVerified: true });
    signup.mutate(
      {
        webId: form.webId, name: form.name, email: form.email, password: form.password, role: form.role,
        rrn: form.rrn.trim(),
        emailChallengeId,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.university.trim() ? { university: form.university.trim() } : {}),
        ...(form.major.trim() ? { major: form.major.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          signupLog.debug("submit_succeeded");
          setDone({ message: res.message });
        },
        onError: (caught) => {
          const { message, status } = apiErrorDetails(caught);
          const field = signupFieldForApiMessage(message);
          signupLog.warn("submit_failed", { status, field: field ?? "form" });
          setFormError({ message, field });
          if (field) focusField(field);
        },
      },
    );
  }

  if (done) {
    // [TBO-31 C2] OTP 가입 = 이메일 인증 완료 상태로 생성 — 남은 절차는 대표 승인뿐(devVerifyLink 소멸).
    return (
      <AuthShell title="가입 신청 완료" subtitle="대표 승인을 기다려 주세요">
        <div className="space-y-3">
          <div className="rounded-lg p-3 text-body bg-canvas-subtle" role="status">{done.message}</div>
          <p className="text-caption text-fg-muted">
            이메일 인증은 이미 완료되었습니다. 대표(super_admin) 승인이 끝나면 바로 로그인할 수 있습니다.
          </p>
          <Link href="/login" className="btn btn-primary w-full h-10">로그인으로 →</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="가입 신청" subtitle="이메일 인증 후 대표(super_admin) 승인이 필요합니다">
      <form ref={formRef} onSubmit={submit} className="space-y-3" noValidate>
        <AuthField label="아이디 (3자 이상)">
          <input
            className="input w-full"
            name="webId"
            value={form.webId}
            onChange={set("webId")}
            placeholder="jiwon_kim"
            required
            minLength={WEB_ID_MIN}
            maxLength={50}
            autoFocus
            aria-invalid={formError?.field === "webId" || webIdVerdict === false}
            aria-describedby="signup-web-id-error signup-web-id-status signup-form-error"
          />
        </AuthField>
        {/* [TBO-31 C2] 중복 라이브 체크 인라인 — 판정 불가(스로틀 등)는 조용히 생략 */}
        <FormFeedback id="signup-web-id-error" kind="error" message={webIdVerdict === false ? "이미 사용 중인 아이디입니다." : null} />
        <FormFeedback id="signup-web-id-status" kind="status" message={webIdVerdict === true ? "사용 가능한 아이디입니다." : null} />
        <AuthField label="이름">
          <input className="input w-full" name="name" value={form.name} onChange={set("name")} placeholder="김지원" required maxLength={50} aria-invalid={formError?.field === "name"} aria-describedby="signup-form-error" />
        </AuthField>
        {/* [TBO-31 C2] 가입 전 이메일 OTP — 인증 완료 시 challengeId 확보, 이메일 수정하면 무효화 */}
        <EmailOtpField
          email={form.email}
          onEmailChange={(email) => {
            setForm((current) => ({ ...current, email }));
            setFormError((current) => current?.field === "email" ? null : current);
          }}
          verifiedChallengeId={emailChallengeId}
          onVerifiedChange={handleVerifiedChange}
          disabled={busy}
          emailInputName="email"
          formErrorId="signup-form-error"
          emailInvalid={formError?.field === "email"}
        />
        <AuthField label="비밀번호 (8자 이상)">
          <input className="input w-full" name="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="••••••••" required maxLength={72} aria-invalid={formError?.field === "password" || !!passwordError} aria-describedby="signup-password-feedback signup-form-error" />
        </AuthField>
        <FormFeedback id="signup-password-feedback" kind="error" message={passwordError} />
        {/* [TBO-31 C2] 비밀번호 확인란 — 불일치 인라인 */}
        <AuthField label="비밀번호 확인">
          <input className="input w-full" name="passwordConfirm" type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={set("passwordConfirm")} placeholder="••••••••" required maxLength={72} aria-invalid={formError?.field === "passwordConfirm" || passwordMismatch} aria-describedby="signup-password-confirm-feedback signup-form-error" />
        </AuthField>
        <FormFeedback id="signup-password-confirm-feedback" kind="error" message={passwordMismatch ? "비밀번호가 일치하지 않습니다." : null} />
        {/* [E0.5 ④b] 승인 판단 근거 필드 — 대표가 승인센터에서 확인 */}
        <AuthField label="전화번호">
          <input className="input w-full" name="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="010-1234-5678" required aria-invalid={formError?.field === "phone"} aria-describedby="signup-form-error" />
        </AuthField>
        <div className="grid grid-cols-2 gap-2">
          <AuthField label="대학교 (출신교)">
            <input className="input w-full" name="university" value={form.university} onChange={set("university")} placeholder="서울대학교" required aria-invalid={formError?.field === "university"} aria-describedby="signup-form-error" />
          </AuthField>
          <AuthField label="전공">
            <input className="input w-full" name="major" value={form.major} onChange={set("major")} placeholder="수학교육과" aria-invalid={formError?.field === "major"} aria-describedby="signup-form-error" />
          </AuthField>
        </div>
        {/* [TBO-31 C2] 출생연도 입력 폐지 → 주민등록번호(서버가 출생연도 파생·암호화 저장) */}
        <AuthField label="주민등록번호">
          <input
            className="input w-full mono"
            name="rrn"
            inputMode="numeric"
            maxLength={14}
            value={form.rrn}
            onChange={(event) => {
              setForm((current) => ({ ...current, rrn: event.target.value.replace(/[^\d-]/g, "") }));
              setFormError((current) => current?.field === "rrn" ? null : current);
            }}
            placeholder="000000-0000000"
            required
            aria-invalid={formError?.field === "rrn"}
            aria-describedby="signup-rrn-help signup-form-error"
          />
        </AuthField>
        <p id="signup-rrn-help" className="text-caption text-fg-subtle">
          급여 원천징수·지급명세서 제출(소득세법)에 사용되며 암호화 저장됩니다
        </p>
        <AuthField label="신청 역할">
          <select className="input w-full" name="role" value={form.role} onChange={set("role")} aria-invalid={formError?.field === "role"} aria-describedby="signup-form-error">
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </AuthField>
        <FormFeedback id="signup-form-error" kind="error" message={formError?.message ?? null} />
        {emailChallengeId == null && (
          <p className="text-caption text-fg-subtle">이메일 인증을 완료해야 가입 신청을 보낼 수 있습니다.</p>
        )}
        <button className="btn btn-primary w-full h-10" disabled={busy || !canSubmit} aria-describedby="signup-form-error">
          {busy ? "신청 중…" : "가입 신청"}
        </button>
      </form>
      <div className="flex items-center justify-between text-caption text-fg-muted pt-1">
        <span>이미 계정이 있으신가요?</span>
        <Link href="/login" className="font-medium text-accent hover:underline">로그인 →</Link>
      </div>
    </AuthShell>
  );
}
