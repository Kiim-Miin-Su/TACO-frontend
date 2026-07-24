"use client";

// [TBO-57 2026-07-24] OTP challenge 공용 필드 코어 — EmailOtpField(TBO-31 C2)의 발송/확인/재전송/
//  무효화 로직을 채널 중립으로 추출했다(대표 지시 "컴포넌트 및 함수 재사용"). 이메일·휴대전화
//  스테퍼가 이 한 컴포넌트를 어댑터(정규화·검증·mutation·문구)만 갈아끼워 재사용한다.
//  UI 계약(라벨·오류 우선순위·비활성 판정)은 lib/domain/otp-challenge 순수 함수 — vitest로 고정.
//  성공/실패 UX(대표 지시 "인증 성공 혹은 실패 UI/UX 개선"):
//  · 성공 = 발송 버튼이 ✓ 인증 완료 배지로 바뀌고 status live region에 완료 문구(초록).
//  · 실패 = GENERIC 오류는 코드 입력 포커스 유지, 잠금/만료는 "재전송" 행동 안내로 치환(빨강 alert).
//  · 재전송 = 쿨다운 카운트다운을 버튼 라벨에 표기, 성공 시 접수 안내가 status로 갱신.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import { AuthField } from "@/components/auth/AuthShell";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { OtpChallenge } from "@/lib/api";
import { formatClock, useCountdownSeconds } from "@/lib/hooks/useCountdownSeconds";
import { logger } from "@/lib/log";
import { isOtpLockedMessage, otpActiveError, otpSendDisabled, otpSendLabel } from "@/lib/domain/otp-challenge";
import { isValidOtpCode } from "@/lib/validation";

const apiStatus = (caught: unknown): number | null =>
  (caught as { response?: { status?: number } }).response?.status ?? null;

/** 채널별 결선 — 정규화·형식 검증·mutation 실행·문구. 훅은 래퍼(Email/PhoneOtpField)가 소유한다. */
export type OtpChallengeAdapter = {
  normalize: (raw: string) => string;
  isValidTarget: (normalized: string) => boolean;
  invalidTargetMessage: string;
  create: (target: string, handlers: { onSuccess: (challenge: OtpChallenge) => void; onError: (caught: unknown) => void }) => void;
  createPending: boolean;
  confirm: (
    vars: { id: number; target: string; code: string },
    handlers: { onSuccess: () => void; onError: (caught: unknown) => void },
  ) => void;
  confirmPending: boolean;
  sentNotice: (maskedTarget: string) => string;
  /** devOtpCode 안내 접두(채널별 — "SMTP 미설정" vs "SENS 미설정") */
  devCodeLabel: string;
  sendFailFallback: string;
  logScope: string;
};

export function OtpChallengeField({
  label,
  target,
  onTargetChange,
  verifiedChallengeId,
  onVerifiedChange,
  adapter,
  disabled = false,
  verifiedLabel,
  inputName,
  inputProps,
  formErrorId,
  targetInvalid = false,
  footer,
}: {
  label: string;
  target: string;
  onTargetChange: (target: string) => void;
  /** 인증 완료된 challenge id — 부모 폼이 소유·submit 게이트/요청 body에 사용. */
  verifiedChallengeId: number | null;
  /** 인증 완료(id) 또는 무효화(null — 대상 수정 시) 통지. */
  onVerifiedChange: (challengeId: number | null) => void;
  adapter: OtpChallengeAdapter;
  disabled?: boolean;
  verifiedLabel: string;
  /** 부모 폼의 중앙 검증·포커스가 이 입력을 찾을 수 있는 안정적 name. */
  inputName: string;
  inputProps: { type: string; autoComplete: string; placeholder: string; maxLength: number; inputMode?: "tel" | "email" };
  formErrorId?: string;
  targetInvalid?: boolean;
  footer?: ReactNode;
}) {
  const log = logger(adapter.logScope);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  // challenge가 발급된(=인증이 유효한) 대상 — 입력이 여기서 벗어나면 발송/인증을 무효화한다.
  const [challengeTarget, setChallengeTarget] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const feedbackId = useId();
  const errorId = `${feedbackId}-error`;
  const statusId = `${feedbackId}-status`;

  const verified = verifiedChallengeId != null;
  const busy = adapter.createPending || adapter.confirmPending;
  const normalized = adapter.normalize(target);
  const cooldownSeconds = useCountdownSeconds(challenge?.resendAvailableAt ?? null);
  const expirySeconds = useCountdownSeconds(challenge?.expiresAt ?? null);
  const expired = !!challenge && !verified && expirySeconds <= 0;

  // challenge 생성 뒤에만 나타나는 OTP 입력은 commit 이후 DOM ref가 생기므로 이 전환 effect에서 포커스한다.
  useEffect(() => {
    if (!challenge || verified) return;
    // 발송 버튼이 같은 commit에서 disabled가 되며 발생시키는 browser blur보다 한 프레임 뒤에 실행한다.
    const frame = window.requestAnimationFrame(() => codeInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [challenge?.id, verified]);

  function handleTargetChange(next: string) {
    onTargetChange(next);
    // 대상 수정 = 기존 발송/인증 무효(불일치) — 상태를 즉시 리셋한다(BE consume이 일치를 강제).
    if (challengeTarget != null && adapter.normalize(next) !== challengeTarget) {
      setChallenge(null);
      setChallengeTarget(null);
      setCode("");
      setLocked(false);
      setError(null);
      setNotice(null);
      if (verified) onVerifiedChange(null);
      log.debug("verification_invalidated", {});
    }
  }

  function send() {
    setError(null);
    setNotice(null);
    if (!normalized || !adapter.isValidTarget(normalized)) {
      setError(adapter.invalidTargetMessage);
      log.debug("challenge_request_blocked", { reason: "target_format" });
      targetInputRef.current?.focus();
      return;
    }
    log.debug("challenge_request_started", {});
    adapter.create(normalized, {
      onSuccess: (next) => {
        setChallenge(next);
        setChallengeTarget(normalized);
        setCode("");
        setLocked(false);
        setNotice(adapter.sentNotice(next.maskedTarget));
        log.debug("challenge_request_accepted", {});
      },
      onError: (caught) => {
        setError(apiErrorMessage(caught, adapter.sendFailFallback));
        log.warn("challenge_request_failed", { status: apiStatus(caught) });
        targetInputRef.current?.focus();
      },
    });
  }

  function confirm() {
    if (!challenge || !challengeTarget || locked || verified || expired) return;
    setError(null);
    setNotice(null);
    if (!isValidOtpCode(code)) {
      setError("인증 코드는 4~10자리 숫자입니다.");
      log.debug("challenge_confirm_blocked", { reason: "code_format" });
      codeInputRef.current?.focus();
      return;
    }
    log.debug("challenge_confirm_started", {});
    adapter.confirm(
      { id: challenge.id, target: challengeTarget, code: code.trim() },
      {
        onSuccess: () => {
          setNotice(null);
          log.debug("challenge_confirm_succeeded", {});
          onVerifiedChange(challenge.id);
        },
        onError: (caught) => {
          const message = apiErrorMessage(caught, "인증 코드를 확인하지 못했습니다.");
          const nextLocked = isOtpLockedMessage(message);
          if (nextLocked) setLocked(true);
          setError(message);
          log.warn("challenge_confirm_failed", { status: apiStatus(caught), locked: nextLocked });
          if (!nextLocked) codeInputRef.current?.focus();
        },
      },
    );
  }

  const sendLabel = otpSendLabel({ pending: adapter.createPending, hasChallenge: !!challenge, cooldownSeconds, verified });
  const activeError = otpActiveError({ locked, expired, error });
  const activeStatus = verified ? verifiedLabel : notice;
  const targetDescribedBy = [errorId, statusId, formErrorId].filter(Boolean).join(" ");

  return (
    <div className="space-y-2">
      <AuthField label={label}>
        <div className="flex items-center gap-2">
          <input
            ref={targetInputRef}
            className="input min-w-0 flex-1"
            name={inputName}
            type={inputProps.type}
            aria-label={label}
            autoComplete={inputProps.autoComplete}
            maxLength={inputProps.maxLength}
            inputMode={inputProps.inputMode}
            required
            value={target}
            onChange={(event) => handleTargetChange(event.target.value)}
            placeholder={inputProps.placeholder}
            disabled={disabled}
            aria-invalid={targetInvalid || (!!error && !challenge)}
            aria-describedby={targetDescribedBy}
          />
          {verified ? (
            <span className="btn btn-sm shrink-0 pointer-events-none text-success border-success/40" aria-hidden="true">
              ✓ 인증 완료
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={send}
              disabled={otpSendDisabled({ disabled, busy, verified, hasTarget: !!normalized, hasChallenge: !!challenge, cooldownSeconds })}
            >
              {sendLabel}
            </button>
          )}
        </div>
      </AuthField>
      {challenge && !verified && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <AuthField label="인증 코드">
              <input
                ref={codeInputRef}
                className="input w-full mono tracking-widest"
                name={`${inputName}OtpCode`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="6자리 숫자"
                disabled={disabled || locked || expired}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                aria-invalid={!!activeError}
                aria-describedby={`${errorId} ${statusId}`}
              />
            </AuthField>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={confirm}
            disabled={disabled || busy || locked || expired}
          >
            {adapter.confirmPending ? "확인 중..." : "코드 확인"}
          </button>
        </div>
      )}
      {challenge?.devOtpCode && !verified && (
        <p className="text-caption text-accent">
          {adapter.devCodeLabel} <span className="mono font-medium">{challenge.devOtpCode}</span>
        </p>
      )}
      {!verified && !locked && !expired && challenge ? (
        <p className="text-caption text-fg-subtle">
          만료까지 <span className="mono">{formatClock(expirySeconds)}</span>
        </p>
      ) : null}
      <FormFeedback id={errorId} kind="error" message={activeError} />
      <FormFeedback id={statusId} kind="status" message={activeStatus} />
      {challenge && !verified ? footer : null}
    </div>
  );
}
