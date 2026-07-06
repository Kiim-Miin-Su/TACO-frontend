'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconSearch, IconBell } from '../ui/icons';
import { useTacoStore } from '@/lib/store';
import { useAppData } from '@/lib/queries';
import { ROLES, roleLabel } from '@/lib/roles';
import { buildTasks } from '@/lib/tasks';
import { currentClaims, clearToken } from '@/lib/auth';
import type { AccountRole } from '@/types';

export default function Topbar() {
  const router = useRouter();
  const currentRole = useTacoStore((s) => s.currentRole);
  // [임시/실험용] dev 역할 토글 — 아래 주석/JSX 참조.
  const overrideRole = useTacoStore((s) => s.overrideRole);
  const clearRoleOverride = useTacoStore((s) => s.clearRoleOverride);
  const devRoleOverride = useTacoStore((s) => s.devRoleOverride);

  // 알림 항목 — 서버 데이터는 TanStack Query(useAppData) 단일 소스에서 조립.
  const { items, count } = buildTasks({ ...useAppData(), currentRole }, currentRole);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 로그인 여부(토큰 존재) — 클라이언트에서만 판단(SSR 불일치 방지).
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => { setLoggedIn(!!currentClaims()); }, []);
  const logout = () => { clearToken(); router.replace('/login'); };

  // 바깥 클릭 시 팝오버 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <header className="h-14 shrink-0 border-b bg-canvas flex items-center gap-3 px-5">
      <div className="relative w-80 max-w-[40vw]">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input className="input pl-8" placeholder="학생, 등록, 결제 검색…" aria-label="검색" />
      </div>
      <div className="flex-1" />
      {/* ─────────────────────────────────────────────────────────────────────
          [임시/실험용 — 나중에 제거] dev 역할 전환 토글.
          로그인 여부와 무관하게 항상 노출 → 로그인 상태에서도 강사·매니저 등 화면을 즉시 실험.
          선택 시 overrideRole()이 currentRole을 바꾸고 devRoleOverride=true로 잠가(AppShell 재하이드레이션 스킵)
          페이지를 이동해도 유지된다. '복귀'로 실제(JWT) 역할로 되돌린다.
          ⚠ 프론트 UI 게이팅만 바뀜 — 백엔드 RBAC는 실제 로그인 JWT 기준(상세: lib/store.ts 주석).
          ───────────────────────────────────────────────────────────────────── */}
      <label
        className="flex items-center gap-1.5 text-caption text-fg-muted"
        title="실험용: 이 화면의 역할만 바꿉니다. 백엔드 권한은 실제 로그인 계정 기준입니다."
      >
        <span className="badge badge-neutral">실험</span>
        역할
        <select
          className="input w-28 h-8"
          value={currentRole}
          onChange={(e) => overrideRole(e.target.value as AccountRole)}
        >
          {ROLES.map((r) => (<option key={r} value={r}>{roleLabel[r]}</option>))}
        </select>
      </label>
      {devRoleOverride && (
        <button className="btn btn-sm" onClick={clearRoleOverride} title="실제 로그인 역할로 되돌리기">복귀</button>
      )}
      {loggedIn && (
        <button className="btn btn-sm" onClick={logout} title="로그아웃">로그아웃</button>
      )}

      {/* 알림 — 앱 알림식 빨간 원 배지(대기 task 수) + 클릭 시 목록 팝오버 */}
      <div className="relative" ref={ref}>
        <button
          className="btn btn-invisible relative"
          aria-label={`알림 ${count}건`}
          onClick={() => setOpen((v) => !v)}
        >
          <IconBell />
          {count > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full grid place-items-center text-[10px] font-bold text-white leading-none bg-danger"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] w-[340px] max-h-[420px] overflow-y-auto rounded-lg border bg-canvas shadow-lg z-50 border-line-muted">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-line-muted">
              <span className="text-body font-semibold">알림 · 대기 중인 할 일</span>
              <span className="badge badge-neutral">{count}</span>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-6 text-body text-fg-subtle text-center">대기 중인 할 일이 없습니다 🎉</div>
            ) : (
              <ul className="divide-y border-line-muted">
                {items.map((t) => (
                  <li key={t.id}>
                    <Link href={t.href} onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-canvas-subtle">
                      <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: `var(--color-${t.tone === 'neutral' ? 'fg-subtle' : t.tone})` }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium text-fg truncate">{t.title}</span>
                        {t.detail && <span className="block text-micro text-fg-subtle truncate">{t.detail}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/" onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-caption text-center text-fg-muted hover:bg-canvas-subtle border-t border-line-muted">
              대시보드에서 전체 보기 →
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
