import { jwtDecode } from 'jwt-decode';

// 프론트는 토큰을 "읽기"만 합니다. 서명/검증은 백엔드(NestJS) 책임.
export interface TokenClaims {
  sub: number; // user id
  name: string;
  roles: string[]; // user_roles
  exp: number; // epoch seconds
  iat: number;
}

export function decodeToken(token: string): TokenClaims | null {
  try {
    return jwtDecode<TokenClaims>(token);
  } catch {
    return null;
  }
}

export function isExpired(token: string): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;
  return claims.exp * 1000 <= Date.now();
}

export function hasRole(token: string, role: string): boolean {
  return decodeToken(token)?.roles?.includes(role) ?? false;
}

// ── 토큰 저장: 쿠키(미들웨어 가드가 읽을 수 있도록) ──
// localStorage가 아닌 쿠키에 두는 이유: Next.js middleware는 서버 엣지에서 쿠키만 읽을 수 있음.
const TOKEN_KEY = 'token';

export function setToken(token: string) {
  if (typeof document === 'undefined') return;
  const claims = decodeToken(token);
  const maxAge = claims ? Math.max(0, claims.exp - Math.floor(Date.now() / 1000)) : 3600;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function clearToken() {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
}

// 현재 로그인 사용자 클레임(없거나 만료면 null).
export function currentClaims(): TokenClaims | null {
  const t = getToken();
  if (!t || isExpired(t)) return null;
  return decodeToken(t);
}
