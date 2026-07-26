// [TBO-65 P2 4-A/B 2026-07-26] 숫자 정규화·보호자 중복 키 — BE common/digits.util과 **동형**
//  (교차 티어 계약: guardianKey 산식이 어긋나면 중복 판정이 서버·화면에서 달라진다 — 테스트로 고정).

/** 모든 비숫자 제거 — 전화 비교·중복 판정용. */
export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** 보호자 중복 판정 키 — 이름(trim·소문자) + 전화(숫자만). BE registrations와 동형. */
export const guardianKey = (name: string, phone: string): string =>
  `${name.trim().toLowerCase()}:${onlyDigits(phone)}`;
