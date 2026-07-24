// [TBO-57 2026-07-24] OTP challenge 필드 공용 도메인 — EmailOtpField에 흩어져 있던 표시 판정을
//  순수 함수로 추출해 이메일·휴대전화 스테퍼(OtpChallengeField)가 같은 규칙을 재사용한다
//  (대표 지시 "컴포넌트 및 함수 재사용" — UI 계약을 단위 테스트로 고정).

/** 서버 잠금 응답("초과") 감지 — 이 챌린지는 회복 불가, 재전송으로 새 코드를 받아야 한다. */
export const isOtpLockedMessage = (message: string): boolean => message.includes("초과");

export type OtpSendLabelInput = {
  pending: boolean;
  hasChallenge: boolean;
  cooldownSeconds: number;
  verified: boolean;
};

/** 발송 버튼 라벨 — 상태 우선순위: 인증 완료 > 발송 중 > 쿨다운 재전송 > 재전송 > 최초 발송. */
export function otpSendLabel({ pending, hasChallenge, cooldownSeconds, verified }: OtpSendLabelInput): string {
  if (verified) return "인증 완료";
  if (pending) return "발송 중...";
  if (!hasChallenge) return "인증 코드 발송";
  return cooldownSeconds > 0 ? `재전송 (${cooldownSeconds}초)` : "재전송";
}

export type OtpActiveErrorInput = {
  locked: boolean;
  expired: boolean;
  error: string | null;
};

/** 실패 UX 단일 규칙 — 잠금·만료는 서버 메시지보다 행동 안내(재전송)가 우선한다. */
export function otpActiveError({ locked, expired, error }: OtpActiveErrorInput): string | null {
  if (locked) return "인증 시도 횟수를 초과했습니다. 쿨다운이 지나면 재전송으로 새 코드를 받아 주세요.";
  if (expired) return "인증 코드가 만료되었습니다. 재전송으로 새 코드를 받아 주세요.";
  return error;
}

/** 발송 버튼 비활성 판정 — 인증 완료·진행 중·대상 없음·쿨다운 중에는 재요청을 막는다. */
export function otpSendDisabled(input: {
  disabled: boolean; busy: boolean; verified: boolean; hasTarget: boolean;
  hasChallenge: boolean; cooldownSeconds: number;
}): boolean {
  return input.disabled || input.busy || input.verified || !input.hasTarget
    || (input.hasChallenge && input.cooldownSeconds > 0);
}
