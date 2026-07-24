// [TBO-57] OTP 필드 UI 계약 단위 테스트 — 이메일·휴대전화 스테퍼가 공유하는 표시 판정
//  (대표 지시 "인증 성공 혹은 실패 UI/UX" 규칙을 순수 함수로 고정).
import { describe, expect, it } from "vitest";
import { isOtpLockedMessage, otpActiveError, otpSendDisabled, otpSendLabel } from "./otp-challenge";

describe("OTP 발송 버튼 라벨", () => {
  it("상태 우선순위: 인증 완료 > 발송 중 > 쿨다운 > 재전송 > 최초 발송", () => {
    expect(otpSendLabel({ pending: false, hasChallenge: false, cooldownSeconds: 0, verified: true })).toBe("인증 완료");
    expect(otpSendLabel({ pending: true, hasChallenge: true, cooldownSeconds: 30, verified: false })).toBe("발송 중...");
    expect(otpSendLabel({ pending: false, hasChallenge: true, cooldownSeconds: 42, verified: false })).toBe("재전송 (42초)");
    expect(otpSendLabel({ pending: false, hasChallenge: true, cooldownSeconds: 0, verified: false })).toBe("재전송");
    expect(otpSendLabel({ pending: false, hasChallenge: false, cooldownSeconds: 0, verified: false })).toBe("인증 코드 발송");
  });
});

describe("OTP 실패 UX 규칙", () => {
  it("잠금·만료는 서버 메시지보다 재전송 행동 안내가 우선한다", () => {
    expect(otpActiveError({ locked: true, expired: false, error: "다른 오류" })).toContain("재전송");
    expect(otpActiveError({ locked: false, expired: true, error: null })).toContain("만료");
    expect(otpActiveError({ locked: false, expired: false, error: "유효하지 않거나 만료된 인증입니다." }))
      .toBe("유효하지 않거나 만료된 인증입니다.");
    expect(otpActiveError({ locked: false, expired: false, error: null })).toBeNull();
  });

  it("서버 잠금 응답('초과')을 감지한다 — GENERIC 오류는 잠금 아님", () => {
    expect(isOtpLockedMessage("인증 시도 횟수를 초과했습니다. 처음부터 다시 요청해 주세요.")).toBe(true);
    expect(isOtpLockedMessage("유효하지 않거나 만료된 인증입니다.")).toBe(false);
  });
});

describe("OTP 발송 비활성 판정", () => {
  const base = { disabled: false, busy: false, verified: false, hasTarget: true, hasChallenge: false, cooldownSeconds: 0 };
  it("인증 완료·진행 중·대상 없음·쿨다운 중에는 재요청을 막는다", () => {
    expect(otpSendDisabled(base)).toBe(false);
    expect(otpSendDisabled({ ...base, verified: true })).toBe(true);
    expect(otpSendDisabled({ ...base, busy: true })).toBe(true);
    expect(otpSendDisabled({ ...base, hasTarget: false })).toBe(true);
    expect(otpSendDisabled({ ...base, hasChallenge: true, cooldownSeconds: 10 })).toBe(true);
    expect(otpSendDisabled({ ...base, hasChallenge: true, cooldownSeconds: 0 })).toBe(false); // 쿨다운 종료 → 재전송 가능
  });
});
