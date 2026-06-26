'use client';
import { IconSearch, IconBell } from '../ui/icons';
import { useTacoStore } from '@/lib/store';
import { ROLES, roleLabel } from '@/lib/roles';
import type { AccountRole } from '@/types';

export default function Topbar() {
  const currentRole = useTacoStore((s) => s.currentRole);
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);

  return (
    <header className="h-14 shrink-0 border-b bg-canvas flex items-center gap-3 px-5">
      <div className="relative w-80 max-w-[40vw]">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input className="input pl-8" placeholder="학생, 등록, 결제 검색…" aria-label="검색" />
      </div>
      <div className="flex-1" />
      {/* 데모: 역할 전환 (권한별 화면 확인용) */}
      <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
        역할
        <select
          className="input w-32 h-8"
          value={currentRole}
          onChange={(e) => setCurrentRole(e.target.value as AccountRole)}
        >
          {ROLES.map((r) => (<option key={r} value={r}>{roleLabel[r]}</option>))}
        </select>
      </label>
      <button className="btn btn-invisible" aria-label="알림"><IconBell /></button>
    </header>
  );
}
