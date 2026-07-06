"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthShell, AuthField } from "@/components/auth/AuthShell";

const ROLE_OPTIONS = [
  { value: "instructor", label: "강사" },
  { value: "manager", label: "매니저" },
  { value: "admin", label: "관리자" },
];

export default function SignupPage() {
  const [form, setForm] = useState({ webId: "", name: "", email: "", password: "", role: "instructor" });
  const [done, setDone] = useState<{ message: string; devVerifyLink?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api.auth.signup(form);
      setDone({ message: res.message, devVerifyLink: res.devVerifyLink });
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } } };
      setErr(ax.response?.data?.message ?? "가입 신청에 실패했습니다.");
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
