// [TBO-80 80A] 승인센터 sudo 배선 가드 — 소스를 읽어 회귀를 차단한다(access-control.guard 패턴).
//
// 배경(TBO-79 4-2·C3~C5): 지출 승인(POST /expenses/:id/approve)과 가입 신청 삭제
// (DELETE /auth/pending/:id)는 서버가 SudoGuard로 재인증을 강제한다. 그런데 승인센터가
// 이 명령들을 useSudoAction 없이 호출해, 대표가 정상 클릭해도 403(SUDO_REQUIRED)을 맞고
// "처리 권한이 없습니다(대표 전용)"라는 자기모순 안내를 받았다.
//
// 이 테스트는 ApprovalsView 소스에서:
//  1) sudo 라우트 명령의 직접 mutate() 호출(코디네이터 우회)을 금지하고
//  2) sudoAction.run() 경유 + sudoAction.modal 렌더를 요구하며
//  3) 403 안내가 SUDO_REQUIRED를 구분하는지(문구 자기모순 제거)를 고정한다.
// 한계: 문자열 검사다 — 의미 증명이 아니라 알려진 우회 패턴의 재발 차단이 목적이다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../features/admin/ApprovalsView.tsx'),
  'utf8',
);

// sudo가 걸린 서버 명령의 클라이언트 진입점 — 이 목록이 늘면 서버 SudoGuard 배치와 함께 갱신한다.
const SUDO_COMMANDS = ['approveExpense', 'deleteAccount'];

describe('ApprovalsView sudo 배선 (TBO-80 80A)', () => {
  for (const command of SUDO_COMMANDS) {
    it(`${command}는 코디네이터를 우회하는 직접 mutate() 호출이 없어야 한다`, () => {
      // mutateAsync는 sudoAction.run(() => x.mutateAsync(...)) 안에서만 허용된다.
      const direct = source.match(new RegExp(`${command}\\.mutate\\(`, 'g')) ?? [];
      expect(direct, `${command}.mutate( 직접 호출 — sudoAction.run(() => ${command}.mutateAsync(...)) 로 감싸야 한다`).toHaveLength(0);
    });

    it(`${command}는 sudoAction.run 안에서 mutateAsync로 호출된다`, () => {
      expect(source).toMatch(new RegExp(`sudoAction\\.run\\(\\(\\) => ${command}\\.mutateAsync`));
    });
  }

  it('sudoAction.modal이 렌더된다 (재인증 프롬프트 없이 run만 하면 조용히 멈춘다)', () => {
    const rendered = source.match(/\{sudoAction\.modal\}/g) ?? [];
    expect(rendered.length).toBeGreaterThanOrEqual(1);
  });

  it('403 안내가 SUDO_REQUIRED(재인증)와 순수 권한 부족을 구분한다', () => {
    expect(source).toMatch(/isSudoRequiredError/);
    // 종전 자기모순 문구 — 대표에게 "대표 전용이라 권한이 없다"고 안내하던 그 문장.
    expect(source).not.toMatch(/처리 권한이 없습니다\(대표 전용\)/);
  });
});
