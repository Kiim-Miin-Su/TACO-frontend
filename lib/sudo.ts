// [유저 관리 2026-07-20 대표 지시] 재인증(sudo) 게이트 — 민감 화면(유저 상세) 진입 전 비밀번호
//  재확인 상태의 **단일 소스**. 검증 자체는 서버(POST /auth/reauth)가 권위이고, 이 모듈은
//  "최근 5분 내 재확인 통과" 세션 상태만 메모리에 든다(저장소 미사용 — 새로고침 시 재확인,
//  탈취 내성). SPA 클라 내비게이션 간에는 유지된다.
const SUDO_TTL_MS = 5 * 60 * 1000;

let verifiedAtMs: number | null = null;

export function markSudoVerified(nowMs: number = Date.now()): void {
  verifiedAtMs = nowMs;
}

export function isSudoValid(nowMs: number = Date.now()): boolean {
  return verifiedAtMs != null && nowMs - verifiedAtMs < SUDO_TTL_MS;
}

export function clearSudo(): void {
  verifiedAtMs = null;
}

export { SUDO_TTL_MS };
