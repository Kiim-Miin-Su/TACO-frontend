"use client";

// [TBO-57 2026-07-24] 가입 전 휴대전화 OTP 필드 — OtpChallengeField 코어 재사용(이메일판과 동일
//  발송/확인/재전송/무효화/성공·실패 UX). 어댑터만 SMS 채널로: 형식=국내 010-1234-5678(가입 폼
//  전화 규약과 동일 — BE가 E.164 canonical 정규화·대조), devOtpCode는 SENS 미설정 개발 모드 전용.
//  표시는 부모(가입 폼)가 signup-config(phoneVerificationRequired — BE required()와 단일 진실원)로
//  게이트한다.
import { OtpChallengeField, type OtpChallengeAdapter } from "@/features/auth/OtpChallengeField";
import { isValidKrPhone } from "@/lib/validation";
import { useConfirmSignupPhoneChallenge, useCreateSignupPhoneChallenge } from "@/lib/queries";

export function PhoneOtpField({
  phone,
  onPhoneChange,
  verifiedChallengeId,
  onVerifiedChange,
  disabled = false,
  verifiedLabel = "휴대전화 인증 완료 — 이 번호로 가입이 진행됩니다.",
  phoneInputName = "phone",
  formErrorId,
  phoneInvalid = false,
}: {
  phone: string;
  onPhoneChange: (phone: string) => void;
  /** 인증 완료된 challenge id — 부모(가입 폼)가 소유·submit 게이트/요청 body에 사용. */
  verifiedChallengeId: number | null;
  /** 인증 완료(id) 또는 무효화(null — 번호 수정 시) 통지. */
  onVerifiedChange: (challengeId: number | null) => void;
  disabled?: boolean;
  verifiedLabel?: string;
  /** 부모 폼의 중앙 검증·포커스가 이 입력을 찾을 수 있는 안정적 name. */
  phoneInputName?: string;
  formErrorId?: string;
  phoneInvalid?: boolean;
}) {
  const createChallenge = useCreateSignupPhoneChallenge();
  const confirmChallenge = useConfirmSignupPhoneChallenge();

  const adapter: OtpChallengeAdapter = {
    normalize: (raw) => raw.trim(),
    isValidTarget: isValidKrPhone,
    invalidTargetMessage: "전화번호는 010-1234-5678 형식으로 입력해 주세요.",
    create: (target, handlers) => createChallenge.mutate(target, handlers),
    createPending: createChallenge.isPending,
    confirm: ({ id, target, code }, handlers) => confirmChallenge.mutate({ id, phone: target, code }, handlers),
    confirmPending: confirmChallenge.isPending,
    sentNotice: (masked) => `${masked}(으)로 인증 문자를 보냈습니다. 문자가 오지 않으면 번호를 확인하고 60초 후 재전송해 주세요.`,
    devCodeLabel: "개발 모드(SENS 미설정) — 인증 코드:",
    sendFailFallback: "인증 문자를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    logScope: "phone-otp",
  };

  return (
    <OtpChallengeField
      label="휴대전화"
      target={phone}
      onTargetChange={onPhoneChange}
      verifiedChallengeId={verifiedChallengeId}
      onVerifiedChange={onVerifiedChange}
      adapter={adapter}
      disabled={disabled}
      verifiedLabel={verifiedLabel}
      inputName={phoneInputName}
      inputProps={{ type: "tel", autoComplete: "tel", placeholder: "010-1234-5678", maxLength: 20, inputMode: "tel" }}
      formErrorId={formErrorId}
      targetInvalid={phoneInvalid}
    />
  );
}
