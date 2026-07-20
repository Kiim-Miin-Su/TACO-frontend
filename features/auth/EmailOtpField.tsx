"use client";

// [TBO-31 C2 2026-07-16] 가입 전 이메일 OTP 공용 필드 — 이메일 입력 + '인증 코드 발송' + 코드
//  확인/재전송(쿨다운 카운트다운) + 상태 인라인(발송됨/인증 완료/오류). SecuritySettingsView OTP 행·
//  ProfileChangeModal stepper 패턴의 공개(비로그인) 판이다.
//  · 카운트다운은 lib/hooks/useCountdownSeconds(모달에서 추출한 공용 훅) 재사용.
//  · devOtpCode(비prod+SMTP 부재)는 기존 devVerifyLink 관례의 OTP판 — 개발 안내로 코드 표기.
//  · 인증 완료 시 challengeId를 부모에 전달, 이메일을 수정하면 발송/인증을 즉시 무효화한다
//    (BE consume이 challenge 이메일과 가입 이메일 일치를 강제 — 불일치 제출을 FE에서 선행 차단).
//  · 재전송 = 발송 재호출(BE에 별도 resend 없음 — 쿨다운 60초 후 기존 pending을 대체).
//  · [TBO-31 C5 2026-07-20] purpose='recovery'로 비로그인 복구(아이디·비밀번호 찾기)에서도 재사용 —
//    엔드포인트(훅)와 완료 문구만 목적별로 갈라진다(BE가 purpose 교차 사용을 차단).
import { useState } from "react";
import { AuthField } from "@/components/auth/AuthShell";
import type { SignupEmailChallenge } from "@/lib/api";
import { isValidEmailFormat } from "@/lib/domain/profile";
import { formatClock, useCountdownSeconds } from "@/lib/hooks/useCountdownSeconds";
import {
  useConfirmRecoveryEmailChallenge,
  useConfirmSignupEmailChallenge,
  useCreateRecoveryEmailChallenge,
  useCreateSignupEmailChallenge,
} from "@/lib/queries";
import { isValidOtpCode } from "@/lib/validation";

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
};

// 서버가 "초과"(시도 한도)로 응답하면 이 챌린지는 회복 불가 — 재전송으로 새 코드를 받아야 한다.
const isLockedMessage = (message: string) => message.includes("초과");

export function EmailOtpField({
  email,
  onEmailChange,
  verifiedChallengeId,
  onVerifiedChange,
  disabled = false,
  purpose = "signup",
  verifiedLabel = "이메일 인증 완료 — 이 이메일로 계정이 생성됩니다.",
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
}) {
  // 두 훅 모두 생성(React 훅 규칙 — 조건부 호출 금지) 후 purpose로 선택.
  const createSignup = useCreateSignupEmailChallenge();
  const confirmSignup = useConfirmSignupEmailChallenge();
  const createRecovery = useCreateRecoveryEmailChallenge();
  const confirmRecovery = useConfirmRecoveryEmailChallenge();
  const createChallenge = purpose === "recovery" ? createRecovery : createSignup;
  const confirmChallenge = purpose === "recovery" ? confirmRecovery : confirmSignup;
  const [challenge, setChallenge] = useState<SignupEmailChallenge | null>(null);
  // challenge가 발급된(=인증이 유효한) 이메일 — 입력이 여기서 벗어나면 발송/인증을 무효화한다.
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const verified = verifiedChallengeId != null;
  const busy = createChallenge.isPending || confirmChallenge.isPending;
  const emailNormalized = email.trim().toLowerCase();
  const cooldownSeconds = useCountdownSeconds(challenge?.resendAvailableAt ?? null);
  const expirySeconds = useCountdownSeconds(challenge?.expiresAt ?? null);
  const expired = !!challenge && !verified && expirySeconds <= 0;

  function handleEmailChange(next: string) {
    onEmailChange(next);
    // 이메일 수정 = 기존 발송/인증 무효(대상 불일치) — 상태를 즉시 리셋한다.
    if (challengeEmail != null && next.trim().toLowerCase() !== challengeEmail) {
      setChallenge(null);
      setChallengeEmail(null);
      setCode("");
      setLocked(false);
      setError(null);
      setNotice(null);
      if (verified) onVerifiedChange(null);
    }
  }

  function send() {
    setError(null);
    setNotice(null);
    if (!emailNormalized || !isValidEmailFormat(emailNormalized)) {
      setError("인증할 이메일 형식이 올바르지 않습니다.");
      return;
    }
    createChallenge.mutate(emailNormalized, {
      onSuccess: (next) => {
        setChallenge(next);
        setChallengeEmail(emailNormalized);
        setCode("");
        setLocked(false);
        setNotice(`${next.maskedTarget}(으)로 인증 코드를 보냈습니다.`);
      },
      onError: (caught) => setError(apiErrorMessage(caught, "인증 코드를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.")),
    });
  }

  function confirm() {
    if (!challenge || !challengeEmail || locked || verified || expired) return;
    setError(null);
    setNotice(null);
    if (!isValidOtpCode(code)) {
      setError("인증 코드는 4~10자리 숫자입니다.");
      return;
    }
    confirmChallenge.mutate(
      { id: challenge.id, email: challengeEmail, code: code.trim() },
      {
        onSuccess: () => {
          setNotice(null);
          onVerifiedChange(challenge.id);
        },
        onError: (caught) => {
          const message = apiErrorMessage(caught, "인증 코드를 확인하지 못했습니다.");
          if (isLockedMessage(message)) setLocked(true);
          setError(message);
        },
      },
    );
  }

  const sendLabel = createChallenge.isPending
    ? "발송 중..."
    : challenge
      ? cooldownSeconds > 0
        ? `재전송 (${cooldownSeconds}초)`
        : "재전송"
      : "인증 코드 발송";

  return (
    <div className="space-y-2">
      <AuthField label="이메일">
        <div className="flex items-center gap-2">
          <input
            className="input min-w-0 flex-1"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
            value={email}
            onChange={(event) => handleEmailChange(event.target.value)}
            placeholder="you@tnacademy.com"
            disabled={disabled}
          />
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={send}
            disabled={disabled || busy || verified || !emailNormalized || (!!challenge && cooldownSeconds > 0)}
          >
            {verified ? "인증 완료" : sendLabel}
          </button>
        </div>
      </AuthField>
      {challenge && !verified && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <AuthField label="인증 코드">
              <input
                className="input w-full mono tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="6자리 숫자"
                disabled={disabled || locked || expired}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
            </AuthField>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={confirm}
            disabled={disabled || busy || locked || expired}
          >
            {confirmChallenge.isPending ? "확인 중..." : "코드 확인"}
          </button>
        </div>
      )}
      {challenge?.devOtpCode && !verified && (
        <p className="text-caption text-accent">
          개발 모드(SMTP 미설정) — 인증 코드: <span className="mono font-medium">{challenge.devOtpCode}</span>
        </p>
      )}
      {verified ? (
        <p className="text-caption text-success" role="status">{verifiedLabel}</p>
      ) : locked ? (
        <p className="text-caption text-danger" role="alert">
          인증 시도 횟수를 초과했습니다. 쿨다운이 지나면 재전송으로 새 코드를 받아 주세요.
        </p>
      ) : expired ? (
        <p className="text-caption text-danger" role="alert">인증 코드가 만료되었습니다. 재전송으로 새 코드를 받아 주세요.</p>
      ) : challenge ? (
        <p className="text-caption text-fg-subtle">
          만료까지 <span className="mono">{formatClock(expirySeconds)}</span>
        </p>
      ) : null}
      {notice && !verified && <p className="text-caption text-success" role="status">{notice}</p>}
      {error && !locked && <p className="text-caption text-danger" role="alert">{error}</p>}
    </div>
  );
}
