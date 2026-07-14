'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { IconSearch, IconBell } from '../ui/icons';
import { useTacoStore } from '@/lib/store';
import { useTaskData } from '@/lib/queries';
import { roleLabel } from '@/lib/roles';
import { buildTasks } from '@/lib/tasks';
import { api } from '@/lib/api';
import { clearToken, myInstructorId } from '@/lib/auth';

export default function Topbar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRole = useTacoStore((s) => s.currentRole);
  const currentAccount = useTacoStore((s) => s.currentAccount);
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);

  // 알림 항목 — 서버 데이터는 TanStack Query(useAppData) 단일 소스에서 조립.
  const { items, count } = buildTasks({ ...useTaskData(), currentRole }, currentRole, myInstructorId() ?? undefined);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const logout = async () => {
    // [TBO-28B] 보안 이벤트 기록(auth_events) — best-effort(실패해도 로그아웃 진행).
    //  [28F QA 수정] clearToken을 먼저/동기로 실행하면 요청 인터셉터가 토큰을 읽기 전에 지워져
    //  POST /auth/logout이 401로 미기록됐다 → 기록을 await한 뒤 토큰을 폐기한다.
    try { await api.auth.logout(); } catch { /* 백엔드 미기동 등 — 로그아웃은 계속 */ }
    clearToken();
    setCurrentAccount(null);
    queryClient.clear(); // 다음 로그인 사용자가 이전 역할의 scoped cache를 보지 않도록 정리
    router.replace('/login');
  };

  // [TBO-29] 클라이언트 계정 전환은 폐지했다. 다른 계정은 로그아웃 후 실제 로그인한다.

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
      {currentAccount && (
        <span className="text-caption text-fg-muted" aria-label="로그인 계정">
          {currentAccount.name} · {roleLabel[currentAccount.role]}
        </span>
      )}
      {currentAccount && (
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
