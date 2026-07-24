'use client';
// [TBO-63 2026-07-24] cmd/ctrl+Z — 캘린더 undo 스택 pop→역연산 실행(대표 지시: 스택 순서 pop, 100개).
//  입력 요소 포커스 중에는 무시(브라우저 기본 텍스트 undo 보존). 실행 후 캘린더 명령 무효화로
//  화면은 항상 서버 응답 기준(SSOT). 실패한 역연산은 재적재하지 않고 콘솔에만 남긴다(무한 루프 방지).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCalendarCommand } from '@/lib/query-cache';
import { popScheduleUndo } from '@/lib/schedule-undo';

export function UndoHotkey() {
  const qc = useQueryClient();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const entry = popScheduleUndo();
      if (!entry) return;
      event.preventDefault();
      entry.run()
        .catch((error) => console.warn(`[TACO:undo] ${entry.label} 실패`, (error as Error)?.message))
        .finally(() => invalidateCalendarCommand(qc));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [qc]);
  return null;
}
