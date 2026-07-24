"use client";

// [TBO-31 C2 2026-07-16] 가입 전 이메일 OTP 공용 필드 — 이메일 입력 + '인증 코드 발송' + 코드
//  확인/재전송(쿨다운 카운트다운) + 상태 인라인(발송됨/인증 완료/오류).
//  · [TBO-31 C5 2026-07-20] purpose='recovery'로 비로그인 복구(아이디·비밀번호 찾기)에서도 재사용 —
//    엔드포인트(훅)와 완료 문구만 목적별로 갈라진다(BE가 purpose 교차 사용을 차단).
//  · [TBO-57 2026-07-24] 발송/확인/무효화/성공·실패 UX 코어를 OtpChallengeField로 추출 —
//    이 파일은 이메일 채널 어댑터(정규화·검증·훅·문구)만 소유한다(휴대전화판과 코어 공유).
import Link from "next/link";
import { OtpChallengeField, type OtpChallengeAdapter } from "@/features/auth/OtpChallengeField";
import { isValidEmailFormat } from "@/lib/domain/profile";
import {
  useConfirmRecoveryEmailChallenge,
  useConfirmSignupEmailChallenge,
  useCreateRecoveryEmailChallenge,
  useCreateSignupEmailChallenge,
} from "@/lib/queries";

export function EmailOtpField({
  email,
  onEmailChange,
  verifiedChallengeId,
  onVerifiedChange,
  disabled = false,
  purpose = "signup",
  verifiedLabel = "이메일 인증 완료 — 이 이메일로 계정이 생성됩니다.",
  emailInputName = "email",
  formErrorId,
  emailInvalid = false,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  /** 인증 완료된 challenge id — 부모(가입/복구 폼)가 소유·submit 게이트/요청 body에 사용. */
  verifiedChallengeId: number | null;
  /** 인증 완료(id) 또는 무효화(null — 이메일 수정 시) 통지. */
  onVerifiedChange: (challengeId: number | null) => void;
  disabled?: boolean;
  /** [TBO-31 C5] 발급 목적 — signup(기본)|recovery. BE가 목적 교차 사용을 차단한다. */
  purpose?: "signup" | "recovery";
  /** 인증 완료 시 표시 문구 — 목적별 맥락(가입 vs 복구)에 맞게 부모가 지정. */
  verifiedLabel?: string;
  /** 부모 폼의 중앙 검증·포커스가 이 입력을 찾을 수 있는 안정적 name. */
  emailInputName?: string;
  /** 부모 폼 오류 live region과 연결할 때 사용. */
  formErrorId?: string;
  emailInvalid?: boolean;
}) {
  // 두 훅 모두 생성(React 훅 규칙 — 조건부 호출 금지) 후 purpose로 선택.
  const createSignup = useCreateSignupEmailChallenge();
  const confirmSignup = useConfirmSignupEmailChallenge();
  const createRecovery = useCreateRecoveryEmailChallenge();
  const confirmRecovery = useConfirmRecoveryEmailChallenge();
  const createChallenge = purpose === "recovery" ? createRecovery : createSignup;
  const confirmChallenge = purpose === "recovery" ? confirmRecovery : confirmSignup;

  const adapter: OtpChallengeAdapter = {
    normalize: (raw) => raw.trim().toLowerCase(),
    isValidTarget: isValidEmailFormat,
    invalidTargetMessage: "인증할 이메일 형식이 올바르지 않습니다.",
    create: (target, handlers) => createChallenge.mutate(target, handlers),
    createPending: createChallenge.isPending,
    confirm: ({ id, target, code }, handlers) => confirmChallenge.mutate({ id, email: target, code }, handlers),
    confirmPending: confirmChallenge.isPending,
    sentNotice: (masked) =>
      purpose === "signup"
        ? `${masked}(으)로 인증 코드 요청을 접수했습니다. 메일이 보이지 않으면 스팸함을 확인하고 기존 계정은 계정 찾기를 이용해 주세요.`
        : `${masked}(으)로 인증 코드 요청을 접수했습니다. 메일이 보이지 않으면 스팸함을 확인해 주세요.`,
    devCodeLabel: "개발 모드(SMTP 미설정) — 인증 코드:",
    sendFailFallback: "인증 코드를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    logScope: "email-otp",
  };

  return (
    <OtpChallengeField
      label="이메일"
      target={email}
      onTargetChange={onEmailChange}
      verifiedChallengeId={verifiedChallengeId}
      onVerifiedChange={onVerifiedChange}
      adapter={adapter}
      disabled={disabled}
      verifiedLabel={verifiedLabel}
      inputName={emailInputName}
      inputProps={{ type: "email", autoComplete: "email", placeholder: "you@tnacademy.com", maxLength: 320 }}
      formErrorId={formErrorId}
      targetInvalid={emailInvalid}
      footer={
        purpose === "signup" ? (
          <p className="text-caption text-fg-muted">
            이미 계정이 있다면 <Link href="/recover" className="font-medium text-accent hover:underline">계정 찾기</Link>를 이용해 주세요.
          </p>
        ) : null
      }
    />
  );
}
