"use client";

// [TBO-29B-4 V3] 프로필 변경 요청 모달 — 현재 비밀번호 재확인 + 연락처(email/phone) 인증 stepper.
//  단일 ModalShell 안에서 본문만 교체(모달 중첩 금지 — DESIGN.md §5). 단계:
//   form  : 변경 필드 + 현재 비밀번호 + 사유 → 비연락처 변경은 즉시 요청, 연락처 변경은 인증 발송
//   verify: 코드 확인(만료 카운트다운·재전송 cooldown·실패 잠금) → verified 후 요청 등록(챌린지 일회 소비)
//  상태 분리: 형식 오류 / 발송 중 / cooldown / 만료 / 잘못된 코드 / 잠김 / 인증 완료(요청 등록).
import { useEffect, useRef, useState } from "react";
import { Field, ModalShell } from "@/components/ui";
import type { MyProfile, ProfileVerification } from "@/lib/api";
import {
  buildProfileChangePayload,
  contactVerificationPlanOf,
  type ContactVerificationPlan,
  type ProfileChangeDraft,
  type ProfileChangePayload,
} from "@/lib/domain/profile";
import {
  useConfirmProfileVerification,
  useCreateProfileChangeRequest,
  useCreateProfileVerification,
  useResendProfileVerification,
} from "@/lib/queries";

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
};

// 서버가 "초과"(시도/재전송 한도)로 응답하면 이 챌린지는 회복 불가 — 처음부터 다시.
const isLockedMessage = (message: string) => message.includes("초과");

/** 1초 간격 카운트다운(초) — 대상 시각이 지나면 0에서 정지. 만료·재전송 cooldown 표시 공용. */
function useCountdownSeconds(targetIso: string | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) {
      setRemaining(0);
      return;
    }
    const compute = () => Math.max(0, Math.ceil((Date.parse(targetIso) - Date.now()) / 1000));
    setRemaining(compute());
    const timer = window.setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);
  return remaining;
}

const formatClock = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

type VerifyContext = {
  challenge: ProfileVerification;
  payload: ProfileChangePayload;
  currentPassword: string;
  plan: NonNullable<ContactVerificationPlan>;
  attemptsLeft: number;
  locked: boolean;
};

export default function ProfileChangeModal({
  profile,
  onClose,
  onCreated,
}: {
  profile: MyProfile;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createRequest = useCreateProfileChangeRequest();
  const createVerification = useCreateProfileVerification();
  const confirmVerification = useConfirmProfileVerification();
  const resendVerification = useResendProfileVerification();

  const [draft, setDraft] = useState<ProfileChangeDraft>({
    name: profile.name,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    countryCode: profile.countryCode ?? "",
    timeZone: profile.timeZone ?? "",
    reason: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [verify, setVerify] = useState<VerifyContext | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (field: keyof ProfileChangeDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  // ModalShell의 autofocus는 mount 시 1회만 — 단계 전환 시 현재 단계 첫 입력으로 포커스 이동.
  const step = verify ? "verify" : "form";
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (step === "verify" ? codeInputRef : passwordInputRef).current?.focus();
  }, [step]);

  const expirySeconds = useCountdownSeconds(verify?.challenge.expiresAt ?? null);
  const cooldownSeconds = useCountdownSeconds(verify?.challenge.resendAvailableAt ?? null);
  const verified = verify?.challenge.status === "verified";
  const expired = !!verify && !verified && expirySeconds <= 0;
  const busy =
    createRequest.isPending || createVerification.isPending || confirmVerification.isPending || resendVerification.isPending;

  function submitRequest(payload: ProfileChangePayload, password: string, verificationChallengeId?: number) {
    createRequest.mutate(
      { ...payload, currentPassword: password, ...(verificationChallengeId ? { verificationChallengeId } : {}) },
      {
        onSuccess: onCreated,
        onError: (caught) => setError(apiErrorMessage(caught, "프로필 변경을 요청하지 못했습니다.")),
      },
    );
  }

  // ── form 단계: 검증 → (연락처 변경) 인증 발송 / (그 외) 즉시 요청 ────────
  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!currentPassword) {
      setError("현재 비밀번호를 입력해 주세요.");
      return;
    }
    const result = buildProfileChangePayload(profile, draft);
    if (!result.payload) {
      setError(result.error ?? "변경 내용을 확인해 주세요.");
      return;
    }
    const payload = result.payload;
    const plan = contactVerificationPlanOf(payload);
    if (!plan) {
      submitRequest(payload, currentPassword);
      return;
    }
    createVerification.mutate(
      { currentPassword, channel: plan.channel, target: plan.target },
      {
        onSuccess: (challenge) => {
          setVerify({ challenge, payload, currentPassword, plan, attemptsLeft: challenge.attemptsLeft ?? 5, locked: false });
          setCode("");
          setNotice(null);
        },
        onError: (caught) => setError(apiErrorMessage(caught, "인증 코드를 발송하지 못했습니다.")),
      },
    );
  }

  // ── verify 단계: 코드 확인 → verified → 요청 등록(재시도 포함) ──────────
  function submitVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verify || verify.locked) return;
    setError(null);
    setNotice(null);
    if (verified) {
      // 인증은 끝났고 요청 등록만 실패한 경우의 재시도 경로.
      submitRequest(verify.payload, verify.currentPassword, verify.challenge.id);
      return;
    }
    if (!/^\d{4,10}$/.test(code.trim())) {
      setError("인증 코드는 4~10자리 숫자입니다.");
      return;
    }
    confirmVerification.mutate(
      { id: verify.challenge.id, code: code.trim() },
      {
        onSuccess: (challenge) => {
          setVerify((current) => (current ? { ...current, challenge } : current));
          setNotice("인증이 완료되었습니다. 변경 요청을 등록합니다...");
          submitRequest(verify.payload, verify.currentPassword, challenge.id);
        },
        onError: (caught) => {
          const message = apiErrorMessage(caught, "인증 코드를 확인하지 못했습니다.");
          if (isLockedMessage(message)) {
            setVerify((current) => (current ? { ...current, locked: true } : current));
            setError(message);
            return;
          }
          setVerify((current) =>
            current ? { ...current, attemptsLeft: Math.max(0, current.attemptsLeft - 1) } : current,
          );
          setError(message);
        },
      },
    );
  }

  function resend() {
    if (!verify || verify.locked || cooldownSeconds > 0) return;
    setError(null);
    setNotice(null);
    resendVerification.mutate(verify.challenge.id, {
      onSuccess: (challenge) => {
        setVerify((current) =>
          current ? { ...current, challenge, attemptsLeft: challenge.attemptsLeft ?? 5 } : current,
        );
        setCode("");
        setNotice("인증 코드를 다시 보냈습니다.");
      },
      onError: (caught) => {
        const message = apiErrorMessage(caught, "인증 코드를 재전송하지 못했습니다.");
        if (isLockedMessage(message)) setVerify((current) => (current ? { ...current, locked: true } : current));
        setError(message);
      },
    });
  }

  function backToForm() {
    setVerify(null);
    setCode("");
    setError(null);
    setNotice(null);
  }

  const channelLabel = verify?.plan.channel === "sms" ? "문자" : "이메일";

  return (
    <ModalShell
      title={verify ? `연락처 인증 (${channelLabel})` : "프로필 변경 요청"}
      size="md"
      onClose={onClose}
      footer={
        verify ? (
          <>
            <button type="button" className="btn btn-sm" onClick={backToForm} disabled={busy}>
              {verify.locked ? "처음부터 다시" : "이전으로"}
            </button>
            <button
              type="submit"
              form="profile-verify-form"
              className="btn btn-sm btn-primary"
              disabled={busy || verify.locked || (expired && !verified)}
            >
              {createRequest.isPending
                ? "요청 등록 중..."
                : confirmVerification.isPending
                  ? "확인 중..."
                  : verified
                    ? "요청 재시도"
                    : "인증 확인"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>취소</button>
            <button type="submit" form="profile-change-form" className="btn btn-sm btn-primary" disabled={busy}>
              {createVerification.isPending ? "인증 코드 발송 중..." : createRequest.isPending ? "요청 중..." : "변경 요청"}
            </button>
          </>
        )
      }
    >
      {verify ? (
        <form id="profile-verify-form" className="space-y-3" onSubmit={submitVerify}>
          <p className="text-body text-fg-muted break-all">
            <span className="mono font-medium text-fg">{verify.challenge.maskedTarget}</span>
            (으)로 인증 코드를 보냈습니다. {channelLabel}로 받은 코드를 입력해 주세요.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="인증 코드">
                <input
                  ref={codeInputRef}
                  className="input w-full mono tracking-widest"
                  data-modal-autofocus="true"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="6자리 숫자"
                  disabled={verify.locked || verified || expired}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={resend}
              disabled={busy || verify.locked || verified || cooldownSeconds > 0}
            >
              {resendVerification.isPending ? "발송 중..." : cooldownSeconds > 0 ? `재전송 (${cooldownSeconds}초)` : "재전송"}
            </button>
          </div>
          {verify.locked ? (
            <p className="text-body text-danger" role="alert">
              인증이 잠겼습니다. 이전 단계로 돌아가 처음부터 다시 요청해 주세요.
            </p>
          ) : verified ? (
            <p className="text-body text-success" role="status">인증 완료 — 변경 요청을 등록합니다.</p>
          ) : expired ? (
            <p className="text-body text-danger" role="alert">인증 코드가 만료되었습니다. 재전송하거나 처음부터 다시 시도해 주세요.</p>
          ) : (
            <p className="text-caption text-fg-subtle">
              만료까지 <span className="mono">{formatClock(expirySeconds)}</span> · 남은 시도 {verify.attemptsLeft}회
            </p>
          )}
          {notice && !verify.locked && <p className="text-caption text-success" role="status">{notice}</p>}
          {error && <p className="text-body text-danger" role="alert">{error}</p>}
        </form>
      ) : (
        <form id="profile-change-form" className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={submitForm}>
          <div className="sm:col-span-2">
            <Field label="현재 비밀번호" hint="본인 확인을 위해 모든 변경 요청에 필요합니다.">
              <input
                ref={passwordInputRef}
                className="input w-full"
                data-modal-autofocus="true"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
          </div>
          <Field label="이름">
            <input className="input w-full" required maxLength={50} value={draft.name} onChange={(event) => set("name", event.target.value)} />
          </Field>
          <Field label="이메일" hint="변경 시 새 이메일로 본인 인증이 필요합니다.">
            <input className="input w-full" type="email" autoComplete="email" maxLength={320} value={draft.email} onChange={(event) => set("email", event.target.value)} />
          </Field>
          {/* [2026-07-15] SMS 인증은 추후 제공 — 형식 검증(010-1234-5678) + 관리자 승인으로 처리 */}
          <Field label="연락처" hint="010-1234-5678 형식 · SMS 인증은 추후 제공 예정(관리자 승인으로 처리)">
            <input className="input w-full" type="tel" autoComplete="tel" maxLength={20} placeholder="010-1234-5678" value={draft.phone} onChange={(event) => set("phone", event.target.value)} />
          </Field>
          <Field label="국가 코드" hint="국가/권역 코드 (예: KR, US-W)">
            <input className="input w-full uppercase" inputMode="text" maxLength={8} value={draft.countryCode} onChange={(event) => set("countryCode", event.target.value.toUpperCase())} />
          </Field>
          <Field label="시간대" hint="IANA 시간대 (예: Asia/Seoul)">
            <input className="input w-full" maxLength={64} value={draft.timeZone} onChange={(event) => set("timeZone", event.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="변경 사유">
              <textarea className="input w-full min-h-24 resize-y" required maxLength={500} value={draft.reason} onChange={(event) => set("reason", event.target.value)} />
            </Field>
          </div>
          {error && <p className="sm:col-span-2 text-body text-danger" role="alert">{error}</p>}
        </form>
      )}
    </ModalShell>
  );
}
