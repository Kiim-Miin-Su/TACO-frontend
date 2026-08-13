import { describe, expect, it } from 'vitest';
import {
  PROFILE_CHANGE_VERIFICATION_PURPOSE,
  credentialVerificationPurposeOf,
} from './verification-purpose';

describe('verification purpose projection', () => {
  it('평시 비밀번호 변경과 첫 로그인 설정을 구분한다', () => {
    expect(credentialVerificationPurposeOf(false)).toBe('password_change');
    expect(credentialVerificationPurposeOf(true)).toBe('account_setup');
  });

  it('마이페이지 변경 요청은 단일 profile_change 목적을 사용한다', () => {
    expect(PROFILE_CHANGE_VERIFICATION_PURPOSE).toBe('profile_change');
  });
});
