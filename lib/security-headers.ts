const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
];

// [TBO-86 G4 2026-08-06] report-only 정책에는 upgrade-insecure-requests를 넣지 않는다 —
//  스펙상 Report-Only에서 무시되는 지시어라 브라우저가 모든 페이지 로드마다 콘솔 오류를 남긴다
//  (G4 매트릭스 실측: 전 역할·전 화면 콘솔 오류 유일 원인). 강제(CSP enforced) 전환 시에만 포함한다.
export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');
export const CONTENT_SECURITY_POLICY_ENFORCED = [...CSP_DIRECTIVES, 'upgrade-insecure-requests'].join('; ');

export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
] as const;
