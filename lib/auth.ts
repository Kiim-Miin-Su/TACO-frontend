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
