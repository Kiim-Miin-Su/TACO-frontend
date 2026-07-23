"use client";

// [TBO-29B-4 V3] 프로필 변경 요청 모달 — 현재 비밀번호 재확인 + 연락처(email/phone) 인증 stepper.
//  단일 ModalShell 안에서 본문만 교체(모달 중첩 금지 — DESIGN.md §5). 단계:
//   form  : 변경 필드 + 현재 비밀번호 + 사유 → 비연락처 변경은 즉시 요청, 연락처 변경은 인증 발송
//   verify: 코드 확인(만료 카운트다운·재전송 cooldown·실패 잠금) → verified 후 요청 등록(챌린지 일회 소비)
//  상태 분리: 형식 오류 / 발송 중 / cooldown / 만료 / 잘못된 코드 / 잠김 / 인증 완료(요청 등록).
import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3] 오류 파싱 단일 진실원
import { Field, ModalShell } from "@/components/ui";
import type { MyProfile, ProfileChangeRequest, ProfileVerification } from "@/lib/api";
import {
  buildProfileChangePayload,
  contactVerificationPlanOf,
  isValidEmailFormat,
  type ContactVerificationPlan,
  type ProfileChangeDraft,
  type ProfileChangePayload,
} from "@/lib/domain/profile";
// [TBO-31 C2/C3 2026-07-16] 카운트다운은 lib/hooks 공용 훅(가입 폼 EmailOtpField와 단일 소스)으로 추출.
import { formatClock, useCountdownSeconds } from "@/lib/hooks/useCountdownSeconds";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import {
  useConfirmProfileVerification,
  useCountries,
  useCreateProfileChangeRequest,
  useCreateProfileVerification,
  useResendProfileVerification,
  useWebIdExists,
} from "@/lib/queries";
import { roleLabel } from "@/lib/roles";
import { WEB_ID_MIN, isValidOtpCode } from "@/lib/validation"; // [B6 C2] 검증 규칙 단일 소스
import { ProfileDetailsFields } from "./ProfileDetailsFields";

// 서버가 "초과"(시도/재전송 한도)로 응답하면 이 챌린지는 회복 불가 — 처음부터 다시.
const isLockedMessage = (message: string) => message.includes("초과");

type VerifyContext = {
  challenge: ProfileVerification;
  // [E0.5 ③] payload 없음 = 이메일 필드 옆 버튼으로 진입한 사전 인증 — verified 후 form으로
  //  복귀해 최종 제출 때 챌린지를 소비한다. payload 있음 = 종전 제출-후-인증 경로(자동 등록).
  payload?: ProfileChangePayload;
  currentPassword: string;
  plan: NonNullable<ContactVerificationPlan>;
  attemptsLeft: number;
  locked: boolean;
  // [TBO-31 C2/C3 2026-07-16] D4 상시 OTP — 비연락처 변경의 본인(등록 이메일) 인증 경유 표시
  //  (연락처 변경 경로와 UX 동일, 안내 문구만 구분).
  self?: boolean;
};

export default function ProfileChangeModal({
  profile,
  onClose,
  onCreated,
}: {
  profile: MyProfile;
  onClose: () => void;
  // [E0.5 ①] 생성 결과를 넘긴다 — 대표(super_admin)는 서버가 즉시 적용해 status가 approved로 온다.
  onCreated: (request: ProfileChangeRequest) => void;
}) {
  const createRequest = useCreateProfileChangeRequest();
  const createVerification = useCreateProfileVerification();
  const confirmVerification = useConfirmProfileVerification();
  const resendVerification = useResendProfileVerification();

  const [draft, setDraft] = useState<ProfileChangeDraft>({
    name: profile.name,
    webId: profile.webId, // [E0] 아이디 변경 — 승인제(대표는 즉시 적용), 적용 시 재로그인 필요
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    countryCode: profile.countryCode ?? "",
    timeZone: profile.timeZone ?? "",
    reason: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [verify, setVerify] = useState<VerifyContext | null>(null);
  // [E0.5 ③] 모달 내 버튼으로 미리 완료해 둔 이메일 인증 — 최종 제출 시 target이 일치하면 소비.
  const [verifiedChallenge, setVerifiedChallenge] = useState<{ id: number; target: string } | null>(null);
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
        onSuccess: (created) => onCreated(created),
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
    // [2026-07-16] SMS 스테퍼는 BE 가용 플래그로 동적 활성(SENS env 투입 시 자동 전환)
    const plan = contactVerificationPlanOf(payload, profile.smsVerificationAvailable === true);
    if (!plan) {
      // [TBO-31 C2/C3 2026-07-16] 전화 설정 변경(SMS provider 부재)은 예외 — BE가 challenge 소비
      //  대상을 새 전화번호(sms)로 기대하므로 본인 이메일 OTP를 보내면 대상 불일치 400이 된다.
      //  provider env 투입 시 위 plan이 sms 스테퍼로 자동 전환된다(기존 규약 유지).
      if (payload.phone != null) {
        submitRequest(payload, currentPassword);
        return;
      }
      // [TBO-31 C2/C3] D4 상시 OTP — 비연락처 변경도 본인 등록 이메일로 challenge 자동 발송 →
      //  verify 단계 경유 → verified 후 요청 등록(BE 400에 기대지 않고 FE가 선행).
      const ownEmail = (profile.email ?? "").trim().toLowerCase();
      if (!ownEmail) {
        setError("등록된 본인 이메일이 없어 프로필 변경 인증을 진행할 수 없습니다.");
        return;
      }
      createVerification.mutate(
        { currentPassword, channel: "email", target: ownEmail },
        {
          onSuccess: (challenge) => {
            setVerify({
              challenge,
              payload,
              currentPassword,
              plan: { channel: "email", target: ownEmail },
              attemptsLeft: challenge.attemptsLeft ?? 5,
              locked: false,
              self: true,
            });
            setCode("");
            setNotice(null);
          },
          onError: (caught) => setError(apiErrorMessage(caught, "인증 코드를 발송하지 못했습니다.")),
        },
      );
      return;
    }
    // [E0.5 ③] 모달 내 버튼으로 이미 인증을 끝낸 이메일이면 재인증 없이 바로 등록(챌린지 소비).
    if (verifiedChallenge && verifiedChallenge.target === plan.target) {
      submitRequest(payload, currentPassword, verifiedChallenge.id);
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

  // ── [E0.5 ③] 이메일 필드 옆 버튼: 폼 제출 없이 인증 코드를 즉시 발송(단계 단축) ──
  function sendEmailCode() {
    setError(null);
    setNotice(null);
    if (!currentPassword) {
      setError("인증 코드 발송에는 현재 비밀번호가 필요합니다. 먼저 입력해 주세요.");
      return;
    }
    const target = draft.email.trim().toLowerCase();
    if (!target || !isValidEmailFormat(target)) {
      setError("인증할 이메일 형식이 올바르지 않습니다.");
      return;
    }
    if (target === (profile.email ?? "").trim().toLowerCase()) {
      setError("현재 이메일과 동일합니다. 변경할 새 이메일을 입력해 주세요.");
      return;
    }
    createVerification.mutate(
      { currentPassword, channel: "email", target },
      {
        onSuccess: (challenge) => {
          setVerify({ challenge, currentPassword, plan: { channel: "email", target }, attemptsLeft: challenge.attemptsLeft ?? 5, locked: false });
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
      // 인증은 끝났고 요청 등록만 실패한 경우의 재시도 경로(제출-후-인증 경로에만 존재).
      if (verify.payload) submitRequest(verify.payload, verify.currentPassword, verify.challenge.id);
      return;
    }
    if (!isValidOtpCode(code)) {
      setError("인증 코드는 4~10자리 숫자입니다.");
      return;
    }
    confirmVerification.mutate(
      { id: verify.challenge.id, code: code.trim() },
      {
        onSuccess: (challenge) => {
          // [E0.5 ③] 버튼 경로(payload 없음): form으로 복귀해 최종 제출 때 챌린지를 소비한다.
          if (!verify.payload) {
            setVerifiedChallenge({ id: challenge.id, target: verify.plan.target });
            setVerify(null);
            setCode("");
            setError(null);
            setNotice("이메일 인증 완료 — 나머지 항목을 확인하고 아래 버튼으로 저장하세요.");
            return;
          }
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
  // [E0.5 ①] 대표(super_admin)는 승인 없이 즉시 적용 — 라벨로 명확히 안내(요청/승인 어휘 제거).
  // [B6 C3 2026-07-16] capability 전환 예외(raw 비교 유지) — 판정 대상이 로그인 계정이 아니라
  //  "편집 대상 프로필"의 역할. ROLE_CAPABILITIES상 signup.decide는 super_admin 전용이라 값은
  //  동치지만, MyProfile.role은 서버 string(AccountRole 미보장)이고 hasCapability는
  //  ROLE_CAPABILITIES[role]을 직접 인덱싱해 도메인 밖 문자열이면 false가 아니라 런타임 오류가
  //  된다(캐스팅도 비건전). 안전한 raw 비교를 의도적으로 유지한다.
  const instantApply = profile.role === "super_admin";
  // [TBO-31 C2/C3 2026-07-16] 대표 아이디 변경 라이브 중복 체크 — STAFF 전용 /users/exists를 500ms
  //  디바운스로 조회(dead API 첫 소비자). 판정 불가(스로틀 등)는 조용히 생략 — 권위는 서버 재검사.
  const webIdDraft = draft.webId.trim();
  const webIdChanged = webIdDraft.toLowerCase() !== profile.webId.trim().toLowerCase();
  const debouncedWebId = useDebouncedValue(webIdDraft, 500);
  const webIdCheckActive = instantApply && webIdChanged && debouncedWebId === webIdDraft && debouncedWebId.length >= WEB_ID_MIN;
  const webIdExistsQuery = useWebIdExists(webIdCheckActive ? debouncedWebId : null);
  const webIdDuplicate = webIdCheckActive && webIdExistsQuery.data ? webIdExistsQuery.data.exists : null;
  // [E0.5 ③] 이메일 인증 버튼 상태 — 새 이메일이 입력됐고 아직 인증 전일 때만 발송 가능.
  const emailTarget = draft.email.trim().toLowerCase();
  const emailChanged = emailTarget !== (profile.email ?? "").trim().toLowerCase();
  const emailPreVerified = !!verifiedChallenge && verifiedChallenge.target === emailTarget;

  // [E0.5 ④] 국가·시간대는 카탈로그(DB countries 표) 토글 선택 — 자유 입력 폐지(서버도 동일 검증).
  //  [2026-07-16 ③] 셀렉트·자동 시간대 로직은 ProfileDetailsFields(공용)로 이동 — 첫 로그인 통합
  //  설정과 단일 소스.
  const countriesQuery = useCountries();
  const countries = countriesQuery.data ?? [];

  return (
    <ModalShell
      title={verify ? (verify.self ? "본인 이메일 인증" : `연락처 인증 (${channelLabel})`) : instantApply ? "프로필 변경" : "프로필 변경 요청"}
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
              {createVerification.isPending
                ? "인증 코드 발송 중..."
                : createRequest.isPending
                  ? (instantApply ? "적용 중..." : "요청 중...")
                  : (instantApply ? "변경 (즉시 적용)" : "변경 요청")}
            </button>
          </>
        )
      }
    >
      {verify ? (
        <form id="profile-verify-form" className="space-y-3" onSubmit={submitVerify}>
          <p className="text-body text-fg-muted break-all">
            {/* [TBO-31 C2/C3 2026-07-16] 본인 인증(비연락처 변경)과 연락처 인증의 안내 문구 구분 */}
            {verify.self ? "본인 확인을 위해 등록된 이메일 " : ""}
            <span className="mono font-medium text-fg">{verify.challenge.maskedTarget}</span>
            (으)로 인증 코드를 보냈습니다. {verify.self ? "받은 코드를 입력해 주세요." : `${channelLabel}로 받은 코드를 입력해 주세요.`}
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
          {/* [E0] 아이디 즉시 변경 폐지 — 승인제(대표는 즉시 적용). 적용되면 기존 로그인이 모두 풀린다.
              [TBO-31 C2/C3 2026-07-16] 매니저·강사·admin은 아이디 변경 불가(BE 400 정합) —
              필드 자체를 대표(super_admin)만 렌더 + 중복 라이브 체크 인라인. */}
          {instantApply && (
            <Field
              label="아이디"
              error={webIdDuplicate === true ? "이미 사용 중인 아이디입니다." : undefined}
              hint={
                webIdDuplicate === false
                  ? "사용 가능한 아이디입니다. 변경 즉시 적용 — 적용 후 다시 로그인해야 합니다."
                  : "변경 즉시 적용 — 적용 후 다시 로그인해야 합니다."
              }
            >
              <input className="input w-full mono" autoComplete="username" minLength={3} maxLength={50} value={draft.webId} onChange={(event) => set("webId", event.target.value)} />
            </Field>
          )}
          {/* [2026-07-16 ③] 프로필 필드 = ProfileDetailsFields 공용(첫 로그인 통합 설정과 단일 소스).
              이메일 인증 버튼([E0.5 ③] 필드 옆 발송)·SMS 동적 힌트도 공용 경로로 주입한다. */}
          <ProfileDetailsFields
            values={{
              name: draft.name,
              email: draft.email,
              phone: draft.phone,
              countryCode: draft.countryCode,
              timeZone: draft.timeZone,
            }}
            onPatch={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            countries={countries}
            countriesPending={countriesQuery.isPending}
            roleLabel={roleLabel[profile.role as keyof typeof roleLabel] ?? profile.role}
            emailAction={{
              label: emailPreVerified ? "인증 완료" : createVerification.isPending ? "발송 중..." : "인증 코드 발송",
              disabled: busy || !emailChanged || emailPreVerified || !emailTarget,
              onClick: sendEmailCode,
            }}
            emailHint={emailPreVerified ? "새 이메일 인증 완료 — 저장하면 반영됩니다." : "변경 시 새 이메일로 본인 인증이 필요합니다."}
            phoneHint={profile.smsVerificationAvailable
              ? "변경 시 새 번호로 문자(SMS) 인증이 필요합니다."
              : "010-1234-5678 또는 +국가코드 형식 · SMS 인증 제공 전까지 관리자 승인으로 처리"}
          />
          <div className="sm:col-span-2">
            <Field label="변경 사유">
              <textarea className="input w-full min-h-24 resize-y" required maxLength={500} value={draft.reason} onChange={(event) => set("reason", event.target.value)} />
            </Field>
          </div>
          {notice && <p className="sm:col-span-2 text-caption text-success" role="status">{notice}</p>}
          {error && <p className="sm:col-span-2 text-body text-danger" role="alert">{error}</p>}
        </form>
      )}
    </ModalShell>
  );
}
