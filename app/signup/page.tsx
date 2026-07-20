"use client";
// [TBO-31 C2 2026-07-16] 가입 폼 강화 — ① 비밀번호 확인란 ② 아이디 중복 라이브 체크(500ms 디바운스)
//  ③ 가입 전 이메일 OTP(EmailOtpField — 인증해야 submit 활성) ④ 출생연도 → 주민등록번호(수집 목적
//  고지·형식은 lib/validation.isValidRrn 단일 소스) ⑤ done 화면 = 이메일 인증 완료 전제(대표 승인
//  대기 안내만 — devVerifyLink 소멸). 쓰기는 중앙 훅(useSignup — CLAUDE.md §18-2).
import { useState } from "react";
import Link from "next/link";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
import { EmailOtpField } from "@/features/auth/EmailOtpField";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useSignup, useWebIdAvailable } from "@/lib/queries";
// [B6 C2] 검증 규칙 단일 소스 — 전화·비밀번호 byte·주민등록번호(계정 보안 화면과 같은 규칙·같은 문구).
import { WEB_ID_MIN, isValidKrPhone, isValidRrn, passwordLengthError } from "@/lib/validation";

const ROLE_OPTIONS = [
  { value: "instructor", label: "강사" },
  { value: "manager", label: "매니저" },
  { value: "admin", label: "관리자" },
];

export default function SignupPage() {
  // [E0.5 ④b] 대표 기대 필드 확장 — 전화·대학·전공(승인 판단 근거, 2026-07-15 QA에서 부재 확인).
  const [form, setForm] = useState({
    webId: "", name: "", email: "", password: "", passwordConfirm: "", role: "instructor",
    phone: "", university: "", major: "", rrn: "",
  });
  // [TBO-31 C2] 가입 전 이메일 OTP — 인증 완료 challenge id(이메일 수정 시 EmailOtpField가 무효화).
  const [emailChallengeId, setEmailChallengeId] = useState<number | null>(null);
  const [done, setDone] = useState<{ message: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const signup = useSignup();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setErr(null);
    // 전화 형식은 서버(SignupDto)와 동일 규칙 — SMS 인증 유예 중엔 형식 방어만(§13.87). [B6 C2] lib/validation 단일 소스.
    if (form.phone && !isValidKrPhone(form.phone)) {
      setErr("전화번호는 010-1234-5678 형식으로 입력해 주세요.");
      return;
    }
    // [TBO-31 C2] 주민등록번호 — 형식+MMDD 타당성만(체크섬 검증 없음 — BE와 동일 규칙).
    if (!isValidRrn(form.rrn)) {
      setErr("주민등록번호 형식이 올바르지 않습니다(예: 950101-1234567).");
      return;
    }
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
        onSuccess: (res) => setDone({ message: res.message }),
        onError: (caught) => {
          const ax = caught as { response?: { data?: { message?: string | string[] } } };
          const message = ax.response?.data?.message;
          setErr(Array.isArray(message) ? message.join(" ") : message ?? "가입 신청에 실패했습니다.");
        },
      },
    );
  }

  if (done) {
    // [TBO-31 C2] OTP 가입 = 이메일 인증 완료 상태로 생성 — 남은 절차는 대표 승인뿐(devVerifyLink 소멸).
    return (
      <AuthShell title="가입 신청 완료" subtitle="대표 승인을 기다려 주세요">
        <div className="space-y-3">
          <div className="rounded-lg p-3 text-body bg-canvas-subtle">{done.message}</div>
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
      <form onSubmit={submit} className="space-y-3">
        <AuthField label="아이디 (3자 이상)">
          <input className="input w-full" value={form.webId} onChange={set("webId")} placeholder="jiwon_kim" required minLength={WEB_ID_MIN} maxLength={50} autoFocus />
        </AuthField>
        {/* [TBO-31 C2] 중복 라이브 체크 인라인 — 판정 불가(스로틀 등)는 조용히 생략 */}
        {webIdVerdict === false && <p className="text-caption text-danger" role="alert">이미 사용 중인 아이디입니다.</p>}
        {webIdVerdict === true && <p className="text-caption text-success" role="status">사용 가능한 아이디입니다.</p>}
        <AuthField label="이름">
          <input className="input w-full" value={form.name} onChange={set("name")} placeholder="김지원" required maxLength={50} />
        </AuthField>
        {/* [TBO-31 C2] 가입 전 이메일 OTP — 인증 완료 시 challengeId 확보, 이메일 수정하면 무효화 */}
        <EmailOtpField
          email={form.email}
          onEmailChange={(email) => setForm((f) => ({ ...f, email }))}
          verifiedChallengeId={emailChallengeId}
          onVerifiedChange={setEmailChallengeId}
          disabled={busy}
        />
        <AuthField label="비밀번호 (8자 이상)">
          <input className="input w-full" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="••••••••" required maxLength={72} />
        </AuthField>
        {passwordError && <p className="text-caption text-danger" role="alert">{passwordError}</p>}
        {/* [TBO-31 C2] 비밀번호 확인란 — 불일치 인라인 */}
        <AuthField label="비밀번호 확인">
          <input className="input w-full" type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={set("passwordConfirm")} placeholder="••••••••" required maxLength={72} />
        </AuthField>
        {passwordMismatch && <p className="text-caption text-danger" role="alert">비밀번호가 일치하지 않습니다.</p>}
        {/* [E0.5 ④b] 승인 판단 근거 필드 — 대표가 승인센터에서 확인 */}
        <AuthField label="전화번호">
          <input className="input w-full" type="tel" value={form.phone} onChange={set("phone")} placeholder="010-1234-5678" required />
        </AuthField>
        <div className="grid grid-cols-2 gap-2">
          <AuthField label="대학교 (출신교)">
            <input className="input w-full" value={form.university} onChange={set("university")} placeholder="서울대학교" required />
          </AuthField>
          <AuthField label="전공">
            <input className="input w-full" value={form.major} onChange={set("major")} placeholder="수학교육과" />
          </AuthField>
        </div>
        {/* [TBO-31 C2] 출생연도 입력 폐지 → 주민등록번호(서버가 출생연도 파생·암호화 저장) */}
        <AuthField label="주민등록번호">
          <input
            className="input w-full mono"
            inputMode="numeric"
            maxLength={14}
            value={form.rrn}
            onChange={(e) => setForm((f) => ({ ...f, rrn: e.target.value.replace(/[^\d-]/g, "") }))}
            placeholder="000000-0000000"
            required
          />
        </AuthField>
        <p className="text-caption text-fg-subtle">
          급여 원천징수·지급명세서 제출(소득세법)에 사용되며 암호화 저장됩니다
        </p>
        <AuthField label="신청 역할">
          <select className="input w-full" value={form.role} onChange={set("role")}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </AuthField>
        {err && <p className="text-caption text-danger" role="alert">{err}</p>}
        {emailChallengeId == null && (
          <p className="text-caption text-fg-subtle">이메일 인증을 완료해야 가입 신청을 보낼 수 있습니다.</p>
        )}
        <button className="btn btn-primary w-full h-10" disabled={busy || !canSubmit}>
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
