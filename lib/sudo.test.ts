// [유저 관리 2026-07-20] sudo 게이트 단일 소스 — TTL 5분·저장소 미사용(새로고침 시 재확인) 검증.
import { beforeEach, describe, expect, it } from 'vitest';
import { SUDO_TTL_MS, clearSudo, isSudoValid, markSudoVerified } from './sudo';

describe('sudo 재인증 게이트 (유저 관리 07-20)', () => {
  beforeEach(() => clearSudo());

  it('기본은 미검증 — 통과 후 유효, TTL(5분) 경과 시 만료', () => {
    expect(isSudoValid()).toBe(false);
    const t0 = 1_000_000;
    markSudoVerified(t0);
    expect(isSudoValid(t0 + 1)).toBe(true);
    expect(isSudoValid(t0 + SUDO_TTL_MS - 1)).toBe(true);
    expect(isSudoValid(t0 + SUDO_TTL_MS)).toBe(false); // 경계 — 정확히 TTL이면 만료
  });

  it('clearSudo로 즉시 무효화된다', () => {
    markSudoVerified();
    expect(isSudoValid()).toBe(true);
    clearSudo();
    expect(isSudoValid()).toBe(false);
  });
});

// [TBO-34 C2-C] 서버 sudo 강제 판정 헬퍼
import { isSudoRequiredError } from './sudo';

describe('isSudoRequiredError — 서버 403 SUDO_REQUIRED 판정(단일 소스)', () => {
  it('403 + SUDO_REQUIRED 본문만 참', () => {
    expect(isSudoRequiredError({ response: { status: 403, data: { code: 'SUDO_REQUIRED', message: 'x' } } })).toBe(true);
    expect(isSudoRequiredError({ response: { status: 403, data: { message: '권한 없음' } } })).toBe(false);
    expect(isSudoRequiredError({ response: { status: 401, data: { code: 'SUDO_REQUIRED' } } })).toBe(false);
    expect(isSudoRequiredError(new Error('network'))).toBe(false);
  });
});
