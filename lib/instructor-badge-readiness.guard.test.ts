// [TBO-80 80J F-2] 강사 배지 readiness 배선 가드 — TBO-62가 강사 라우트를 제거했을 때
//  usePayReadiness가 강사에게 비활성(enabled=false)이 되며 lib/tasks.ts 강사 배지 피드가
//  죽은 소비처가 됐던 회귀를 소스 레벨로 잠근다(단위테스트는 slice 수동 주입이라 못 잡았다).
//  이빨 실증: 수정 전 misc.ts/finance.ts에는 아래 패턴이 없어 3케이스 전부 실패한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const misc = readFileSync(join(__dirname, 'queries/misc.ts'), 'utf8');
const finance = readFileSync(join(__dirname, 'api/finance.ts'), 'utf8');

describe('instructor badge readiness wiring guard (TBO-80 80J F-2)', () => {
  it('api 클라이언트에 강사 본인 비금전 라우트가 있다', () => {
    expect(finance).toMatch(/myReadiness: \(\) => http\.get<PayReadiness>\("\/payouts\/me\/readiness"\)/);
  });

  it('usePayReadiness가 강사(instructor.self)에도 활성화된다 — 배지 피드 생존 조건', () => {
    expect(misc).toMatch(/can\("instructor\.self"\)/);
    expect(misc).toMatch(/enabled: managerScope \|\| instructorSelf/);
  });

  it('강사 분기는 me 라우트, 관리자 분기는 전체 라우트를 소비한다(권한 경계 유지)', () => {
    expect(misc).toMatch(/managerScope \? api\.payouts\.readiness\(\) : api\.payouts\.myReadiness\(\)/);
  });
});
