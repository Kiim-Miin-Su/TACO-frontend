"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";
// [B6 C2] 검증 규칙 단일 소스 — 전화·출생연도(계정 보안 화면과 같은 규칙·같은 문구).
import { BIRTH_YEAR_MAX, BIRTH_YEAR_MIN, isValidBirthYear, isValidKrPhone } from "@/lib/validation";

const ROLE_OPTIONS = [
  { value: "instructor", label: "강사" },
  { value: "manager", label: "매니저" },
  { value: "admin", label: "관리자" },
];

export default function SignupPage() {
  // [E0.5 ④b] 대표 기대 필드 확장 — 전화·대학·전공·출생연도(승인 판단 근거, 2026-07-15 QA에서 부재 확인).
  const [form, setForm] = useState({
    webId: "", name: "", email: "", password: "", role: "instructor",
    phone: "", university: "", major: "", birthYear: "",
  });
  const [done, setDone] = useState<{ message: string; devVerifyLink?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    // 전화 형식은 서버(SignupDto)와 동일 규칙 — SMS 인증 유예 중엔 형식 방어만(§13.87). [B6 C2] lib/validation 단일 소스.
    if (form.phone && !isValidKrPhone(form.phone)) {
      setErr("전화번호는 010-1234-5678 형식으로 입력해 주세요.");
      setBusy(false);
      return;
    }
    const birthYear = form.birthYear.trim() ? Number(form.birthYear.trim()) : undefined;
    if (form.birthYear.trim() && !isValidBirthYear(form.birthYear)) {
      setErr(`출생연도는 ${BIRTH_YEAR_MIN}~${BIRTH_YEAR_MAX} 사이의 숫자로 입력해 주세요.`);
      setBusy(false);
      return;
    }
    try {
      const res = await api.auth.signup({
        webId: form.webId, name: form.name, email: form.email, password: form.password, role: form.role,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.university.trim() ? { university: form.university.trim() } : {}),
        ...(form.major.trim() ? { major: form.major.trim() } : {}),
        ...(birthYear != null ? { birthYear } : {}),
      });
      setDone({ message: res.message, devVerifyLink: res.devVerifyLink });
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const message = ax.response?.data?.message;
      setErr(Array.isArray(message) ? message.join(" ") : message ?? "가입 신청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="가입 신청 완료" subtitle="이메일 인증 후 대표 승인을 기다려 주세요">
        <div className="space-y-3">
          <div className="rounded-lg p-3 text-body bg-canvas-subtle">{done.message}</div>
          {done.devVerifyLink && (
            <div className="text-caption text-fg-muted space-y-1">
              <div>개발 모드(SMTP 미설정) — 아래 링크로 이메일 인증을 진행하세요:</div>
              <Link href={done.devVerifyLink.replace(/^https?:\/\/[^/]+/, "")} className="text-accent break-all hover:underline">{done.devVerifyLink}</Link>
            </div>
          )}
          <Link href="/login" className="btn btn-primary w-full h-10">로그인으로 →</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="가입 신청" subtitle="신청 후 대표(super_admin) 승인이 필요합니다">
      <form onSubmit={submit} className="space-y-3">
        <AuthField label="아이디 (3자 이상)">
          <input className="input w-full" value={form.webId} onChange={set("webId")} placeholder="jiwon_kim" autoFocus />
        </AuthField>
        <AuthField label="이름">
          <input className="input w-full" value={form.name} onChange={set("name")} placeholder="김지원" />
        </AuthField>
        <AuthField label="이메일">
          <input className="input w-full" type="email" value={form.email} onChange={set("email")} placeholder="you@tnacademy.com" />
        </AuthField>
        <AuthField label="비밀번호 (8자 이상)">
          <input className="input w-full" type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
        </AuthField>
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
        <AuthField label="출생연도">
          <input className="input w-full" inputMode="numeric" maxLength={4} value={form.birthYear} onChange={set("birthYear")} placeholder="1998" required />
        </AuthField>
        <AuthField label="신청 역할">
          <select className="input w-full" value={form.role} onChange={set("role")}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </AuthField>
        {err && <p className="text-caption text-danger">{err}</p>}
        <button className="btn btn-primary w-full h-10" disabled={busy}>{busy ? "신청 중…" : "가입 신청"}</button>
      </form>
      <div className="flex items-center justify-between text-caption text-fg-muted pt-1">
        <span>이미 계정이 있으신가요?</span>
        <Link href="/login" className="font-medium text-accent hover:underline">로그인 →</Link>
      </div>
    </AuthShell>
  );
}
