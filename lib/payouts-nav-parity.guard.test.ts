// [TBO-80 80G] 강사 /payouts 배지 ↔ 내비게이션 정합 가드 (TBO-79 O13 반쪽 배선 재발 방지).
//
// 배경: TBO-73A가 강사 정산 메뉴를 비노출로 바꾼 뒤에도 lib/tasks.ts는 강사에게 /payouts
// href 배지·할일을 만들었다 — 볼 수 없는 화면으로 안내하는 반쪽 배선. 대표 결정(2026-07-31)으로
// 강사 "내 정산" 읽기 화면을 신설해 링크의 도착지를 만들었다. 이 가드는 그 정합이 다시
// 깨지는 두 방향을 모두 잠근다:
//   ① tasks.ts가 강사에게 /payouts 링크를 만드는 한, Sidebar에 instructor 가시 /payouts 항목이
//      있어야 한다(메뉴 제거 시 tasks 재배선도 함께 — 한쪽만 바꾸면 실패).
//   ② PayoutsView는 instructor.self에게 안내 문구가 아니라 실제 화면(MyPayoutsView)을 준다.
// 한계: 소스 문자열 가드다 — 렌더 검증이 아니라 배선 존재의 재발 차단이 목적.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleHasCapability } from '@kms545487/contracts';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('강사 /payouts 배지 ↔ 메뉴 정합 (TBO-80 80G)', () => {
  const tasks = read('lib/tasks.ts');
  const navigation = read('components/layout/navigation.ts');
  const payoutsView = read('features/payouts/PayoutsView.tsx');

  it('전제: tasks.ts는 강사 대상 /payouts 링크를 만든다(이 전제가 사라지면 이 가드도 재검토)', () => {
    expect(tasks).toMatch(/forInstructor \? '\/payouts'|put\('\/payouts'/);
  });

  it('공용 내비게이션 정의에 instructor 가시 /payouts 항목이 있다(캐퍼빌리티 매트릭스와 일치)', () => {
    expect(navigation).toMatch(/href: "\/payouts", capability: "instructor\.self"/);
    // 계약 매트릭스 자체 검증 — instructor.self는 instructor 역할에서 참
    expect(roleHasCapability('instructor', 'instructor.self')).toBe(true);
    expect(roleHasCapability('super_admin', 'instructor.self')).toBe(false);
  });

  it('PayoutsView는 instructor.self에게 MyPayoutsView(실화면)를 반환한다', () => {
    expect(payoutsView).toMatch(/instructor\.self.*MyPayoutsView|MyPayoutsView.*instructor\.self/s);
  });

  it('MyPayoutsView는 명령 버튼 0 — 읽기 전용 경계(생성·승인·조정·지급·회수는 대표 전용)', () => {
    const myView = read('features/payouts/MyPayoutsView.tsx');
    for (const forbidden of ['useGeneratePayout', 'useConfirmPayout', 'usePayPayout', 'useAdjustPayout', 'useReversePayout', 'useMutation']) {
      expect(myView).not.toContain(forbidden);
    }
    expect(myView).toContain('useMyPayouts');
  });
});
