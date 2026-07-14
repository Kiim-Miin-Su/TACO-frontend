'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTacoStore } from '@/lib/store';
import { isAdmin, roleLabel } from '@/lib/roles';

// 관리자 전용 가드 (매니저/관리자/대표만)
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const role = useTacoStore((s) => s.currentRole);
  if (!isAdmin(role)) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <div className="card card-pad text-section text-fg-muted">
          관리자 전용 화면입니다. 현재 역할: <b>{roleLabel[role]}</b>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

const TABS: [string, string][] = [
  ['/admin', '개요·캘린더'],
  ['/admin/courses', '코스·과목'],
  ['/admin/events', '이벤트'],
  ['/admin/approvals', '승인'],
];

export function AdminHeader() {
  const path = usePathname();
  return (
    <div className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-title font-bold">관리자</h1>
        <p className="text-body text-fg-muted mt-0.5">코스·과목 관리 · 학원 이벤트 발행 · 통합 캘린더</p>
      </div>
      <div className="flex gap-1.5">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={`btn btn-sm ${path === href ? 'badge-accent' : ''}`}>{label}</Link>
        ))}
      </div>
    </div>
  );
}
