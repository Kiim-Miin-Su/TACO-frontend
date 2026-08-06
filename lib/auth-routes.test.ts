import { describe, expect, it } from 'vitest';
import { isInternalRedirectPath, isPublicRoute, sessionExpiredLogoutUrl } from './auth-routes';

// [TBO-86I-5] 터미널 세션 만료 경로 — /login 직행이 아니라 /logout 경유(쿠키 만료 후 안내).
//  운영 실측 결함: stale access cookie가 남으면 미들웨어 낙관 가드가 /login을 앱으로 되튕겨
//  화면은 살아있고 콘솔 401만 쌓였다. 이 규칙이 그 재발을 막는다.
describe('sessionExpiredLogoutUrl', () => {
  it('업무 화면에서 만료되면 /logout?expired=1 + 원 화면 복귀 경로를 만든다', () => {
    expect(sessionExpiredLogoutUrl('/calendar', '')).toBe('/logout?expired=1&redirect=%2Fcalendar');
    expect(sessionExpiredLogoutUrl('/reports/write', '?from=2026-06-01'))
      .toBe('/logout?expired=1&redirect=%2Freports%2Fwrite%3Ffrom%3D2026-06-01');
  });

  it('공개 경로·로그아웃 자신은 복귀 경로 없이 expired 안내만 전달한다', () => {
    expect(sessionExpiredLogoutUrl('/login', '')).toBe('/logout?expired=1');
    expect(sessionExpiredLogoutUrl('/logout', '')).toBe('/logout?expired=1');
  });

  it('내부 경로 판정 — 프로토콜 상대("//")·외부 URL·비문자열은 거부한다(open redirect 차단)', () => {
    expect(isInternalRedirectPath('/calendar')).toBe(true);
    expect(isInternalRedirectPath('//evil.example')).toBe(false);
    expect(isInternalRedirectPath('https://evil.example')).toBe(false);
    expect(isInternalRedirectPath(null)).toBe(false);
    expect(isInternalRedirectPath(undefined)).toBe(false);
  });

  it('공개 경로 목록 — 로그인·가입·인증·복구는 비로그인 접근 허용', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/recover/anything')).toBe(true);
    expect(isPublicRoute('/calendar')).toBe(false);
  });
});
