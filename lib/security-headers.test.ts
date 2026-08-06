import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_ENFORCED, SECURITY_HEADERS } from './security-headers';

describe('frontend security headers', () => {
  it('declares framing, MIME, referrer and browser capability defenses centrally', () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]))).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
  });

  it('starts CSP in report-only mode with the critical document boundaries', () => {
    expect(SECURITY_HEADERS.some(({ key }) => key === 'Content-Security-Policy-Report-Only')).toBe(true);
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
  });

  // [TBO-86 G4] Report-Only에서 무시되는 지시어(upgrade-insecure-requests)가 report-only 값에 남으면
  //  전 화면 콘솔 오류가 상시 발생한다(G4 매트릭스 실측 — 수정 전 이 단언은 실패한다). 강제 정책에만 둔다.
  it('keeps upgrade-insecure-requests out of the report-only policy (enforced variant only)', () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain('upgrade-insecure-requests');
    expect(CONTENT_SECURITY_POLICY_ENFORCED).toContain('upgrade-insecure-requests');
  });
});
