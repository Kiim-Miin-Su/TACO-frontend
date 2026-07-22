"use client";
import React from "react";
import BrandMark from "@/components/brand/BrandMark";
import { ACADEMY_BRAND } from "@/lib/brand";

// 로그인/가입/인증 공용 셸 — 좌측 브랜드 패널 + 우측 카드(반응형: 모바일은 카드만).
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas-subtle">
      {/* 브랜드 패널 */}
      <div className="hidden lg:flex flex-col justify-between p-10 text-white relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${ACADEMY_BRAND.colors.charcoal} 0%, ${ACADEMY_BRAND.colors.charcoalWarm} 58%, ${ACADEMY_BRAND.colors.bronzeDeep} 100%)`,
        }}>
        <div className="flex items-center gap-2.5">
          <BrandMark size={36} className="rounded-lg shadow-medium" priority />
          <div className="leading-tight">
            <div className="font-semibold">TACO ERP</div>
            <div className="text-caption opacity-70">TN Academy 백오피스</div>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-stat font-semibold leading-tight">학원 운영을<br />한 화면에서.</h2>
          <p className="text-body opacity-80 max-w-[360px]">스케줄·시수·정산·권한을 사내 담당자 전용으로 통합 관리합니다. 학생·학부모용 서비스는 별도 플랫폼에서 제공됩니다.</p>
        </div>
        <div className="text-micro opacity-60">© 2026 TN Academy · 내부 전용</div>
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute right-10 bottom-24 w-40 h-40 rounded-full bg-white/5" />
      </div>

      {/* 폼 카드 */}
      <div className="grid place-items-center p-6">
        <div className="card card-pad w-full max-w-[400px] space-y-5">
          <div className="lg:hidden flex items-center gap-2.5">
            <BrandMark size={32} className="rounded-md" priority />
            <div className="font-semibold">TACO ERP</div>
          </div>
          <div>
            <h1 className="text-title font-bold">{title}</h1>
            {subtitle && <p className="text-body text-fg-subtle mt-0.5">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-caption text-fg-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
