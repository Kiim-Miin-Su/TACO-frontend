// [TBO-94] 모바일 우선 공용 셸 회귀 가드.
// 화면별 임시 메뉴나 별도 권한 판정을 만들지 않고, 데스크톱/모바일 내비게이션이 같은
// 정의·배지 훅을 소비하는지와 핵심 모바일 표면이 유지되는지를 소스 수준에서 잠근다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('[TBO-94] 모바일 우선 공용 셸', () => {
  it('데스크톱과 모바일 메뉴는 같은 권한·배지 훅을 소비한다', () => {
    const sidebar = read('components/layout/Sidebar.tsx');
    const mobile = read('components/layout/MobileNavigation.tsx');
    const navigation = read('components/layout/navigation.ts');

    expect(sidebar).toContain('useAppNavigation()');
    expect(mobile).toContain('useAppNavigation()');
    expect(navigation).toContain('visibleNavigationGroups');
    expect(navigation).toContain('capability: "finance.access"');
  });

  it('앱 셸은 모바일 하단 메뉴 공간과 safe area를 확보한다', () => {
    const shell = read('components/layout/AppShell.tsx');
    expect(shell).toContain('<MobileNavigation />');
    expect(shell).toContain('env(safe-area-inset-bottom)');
    expect(shell).toContain('md:pb-0');
  });

  it('공용 모달은 모바일 하단 시트와 터치 가능한 푸터를 제공한다', () => {
    const modal = read('components/ui/Modal.tsx');
    expect(modal).toContain('items-end');
    expect(modal).toContain('max-h-[92dvh]');
    expect(modal).toContain('modal-footer');
    expect(modal).toContain('safe-area-inset-bottom');
  });

  it('리포트 작성 필요 목록은 모바일 전용 리스트와 데스크톱 표를 분리한다', () => {
    const reports = read('features/reports/ReportsCalendarView.tsx');
    expect(reports).toContain('md:hidden');
    expect(reports).toContain('hidden md:block');
    expect(reports).toContain('min-h-20');
  });

  it('캘린더 본문과 보조 패널은 모바일 세로 흐름, 데스크톱 가로 흐름을 쓴다', () => {
    const calendar = read('features/calendar/ScheduleCalendar.tsx');
    const pane = read('features/calendar/CalendarPane.tsx');
    const controls = read('features/calendar/CalendarFilterControls.tsx');
    expect(calendar).toContain('flex-col items-stretch');
    expect(calendar).toContain('lg:flex-row');
    // [TBO-104 2A] 우측은 단일 CalendarInspector(lg:w-72)로 수렴 — 종전 5카드 스택(lg:w-64) 폐지.
    expect(calendar).toContain('lg:w-72');
    expect(calendar).toContain('<CalendarInspector');
    // [2026-08-18 대표 피드백] pane 헤더 필터는 세로 랩 대신 한 줄 가로 스크롤 툴바 — 헤더 높이 고정.
    expect(pane).toContain('overflow-x-auto');
    expect(pane).not.toMatch(/flex min-w-0 flex-wrap items-center gap-2">\s*\{allowedDimensions/);
    expect(controls).toContain('max-h-56 overflow-y-auto');
  });
});
