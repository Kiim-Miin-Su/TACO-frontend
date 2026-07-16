"use client";

// [E0 2026-07-15] 계정 보안 — 두 흐름의 화면.
//  · 첫 로그인 강제 변경(forced): 아이디+비밀번호+프로필 통합 설정(E0.5 ⑥).
//    [대표 추가요청 2026-07-16] ① users 수정 가능 컬럼 전부(국가·시간대·출신교·전공·출생연도,
//    직책은 읽기 전용) ② **설정할 이메일의 OTP 인증 필수**(부트스트랩 무인증 예외 폐지 — 오타
//    이메일이 verified로 박히면 복구·알림이 죽은 주소로 가는 위험) ③ 필드 UI는
//    ProfileDetailsFields 공용 컴포넌트(마이 페이지 프로필 변경 모달과 단일 소스).
//  · 평시(비강제): 비밀번호 변경만 — 현재 비밀번호 재확인 + 본인 이메일 OTP 소비(대표 참고사항).
//    아이디 변경은 마이 페이지의 프로필 변경 요청(승인제)로 이동 — 안내만 표시.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, Field } from "@/components/ui";
import { api, type ProfileVerification } from "@/lib/api";
import { clearToken, currentClaims } from "@/lib/auth";
import { resetPreferences } from "@/lib/storage/preferences";
import { useTacoStore } from "@/lib/store";
// [B6 C2] 쓰기 3종(인증 발송/확인·자격증명 변경)을 중앙 mutation 훅으로 — 수동 api.* 잔재 제거(E1).
import { useChangeCredentials, useConfirmProfileVerification, useCountries, useCreateProfileVerification } from "@/lib/queries";
import { roleLabel } from "@/lib/roles";
import type { AccountRole } from "@/types";
import { isValidEmailFormat } from "@/lib/domain/profile";
// [B6 C2] 검증 규칙 단일 소스(lib/validation) — OTP·전화·출생연도·비밀번호 byte 기준.
import { BIRTH_YEAR_MAX, BIRTH_YEAR_MIN, isValidBirthYear, isValidKrPhone, isValidOtpCode, passwordLengthError } from "@/lib/validation";
import { ProfileDetailsFields, type ProfileDetailsValues } from "./ProfileDetailsFields";

const apiErrorMessage = (caught: unknown, fallback: string): string => {
  const apiError = caught as { response?: { data?: { message?: string | string[] } } };
  const message = apiError.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
};

export default function SecuritySettingsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setCurrentAccount = useTacoStore((s) => s.setCurrentAccount);
  const claims = currentClaims();
  const forced = claims?.mustChangePassword === true;
  const myRole = (claims?.roles?.[0] ?? null) as AccountRole | null;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newWebId, setNewWebId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // [E0.5 ⑥ + 2026-07-16 확장] 첫 로그인 강제 변경 — users 수정 가능 컬럼 전부를 한 번에.
  const [profileDraft, setProfileDraft] = useState<ProfileDetailsValues>({
    name: claims?.name ?? "",
    email: "",
    phone: "",
    countryCode: "KR",
    timeZone: "Asia/Seoul",
    university: "",
    major: "",
    birthYear: "",
  });
  const patchProfile = (patch: Partial<ProfileDetailsValues>) =>
    setProfileDraft((current) => ({ ...current, ...patch }));
  // 이메일 OTP — forced: 대상=**설정할 새 이메일** / 평시: 대상=본인 현재 이메일(서버 조회).
  const [otp, setOtp] = useState<ProfileVerification | null>(null);
  const [otpTarget, setOtpTarget] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // 다단계 흐름(발송→확인→변경)을 하나로 묶는 화면 상태
  const countriesQuery = useCountries();
  const createVerification = useCreateProfileVerification();
  const confirmVerification = useConfirmProfileVerification();
  const changeCredentials = useChangeCredentials();

  // 이메일을 인증 후 수정하면 그 인증은 대상 불일치 — 상태로 명확히 리셋한다.
  const emailNormalized = profileDraft.email.trim().toLowerCase();
  const emailVerifiedForCurrentTarget = otpVerified && otpTarget === emailNormalized;

  function logout() {
    clearToken();
    setCurrentAccount(null);
    queryClient.clear();
    resetPreferences(); // [E0 storage 감사] 계정 간 취향 preference 누출 차단
    router.replace("/login");
  }

  async function sendOtp() {
    setError(null);
    setNotice(null);
    if (!currentPassword) return setError("인증 코드 발송에는 현재 비밀번호가 필요합니다. 먼저 입력해 주세요.");
    setBusy(true);
    try {
      // forced: 화면에 입력한 새 이메일로 발송(본인 소유 실증). 평시: 등록된 본인 이메일(서버 확인).
      let target = emailNormalized;
      if (forced) {
        if (!target || !isValidEmailFormat(target)) {
          setError("인증할 이메일 형식이 올바르지 않습니다.");
          return;
        }
      } else {
        const me = await api.account.profile();
        if (!me.email) {
          setError("등록된 이메일이 없습니다. 마이 페이지에서 이메일을 먼저 등록해 주세요.");
          return;
        }
        target = me.email;
      }
      const challenge = await createVerification.mutateAsync({
        currentPassword,
        channel: "email",
        target,
      });
      setOtp(challenge);
      setOtpTarget(target.trim().toLowerCase());
      setOtpCode("");
      setOtpVerified(false);
      setNotice(`${challenge.maskedTarget}(으)로 인증 코드를 보냈습니다.`);
    } catch (caught) {
      setError(apiErrorMessage(caught, "인증 코드를 발송하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!otp) return;
    setError(null);
    setNotice(null);
    if (!isValidOtpCode(otpCode)) return setError("인증 코드는 4~10자리 숫자입니다.");
    setBusy(true);
    try {
      await confirmVerification.mutateAsync({ id: otp.id, code: otpCode.trim() });
      setOtpVerified(true);
      setNotice(forced ? "이메일 인증 완료 — 나머지 항목을 확인하고 설정을 완료하세요." : "이메일 인증 완료 — 이제 비밀번호를 변경할 수 있습니다.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "인증 코드를 확인하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const nextWebId = newWebId.trim();
    if (!currentPassword) return setError("현재 비밀번호를 입력해 주세요.");
    if (forced && (!nextWebId || !newPassword)) return setError("첫 로그인에서는 새 아이디와 새 비밀번호를 모두 입력해 주세요.");
    if (!forced && !newPassword) return setError("새 비밀번호를 입력해 주세요.");
    if (newPassword && newPassword !== confirmPassword) return setError("새 비밀번호 확인이 일치하지 않습니다.");
    // [B6 C2] byte 기준 검증은 lib/validation 단일 소스(reset-password와 동일 규칙·동일 문구).
    const passwordError = newPassword ? passwordLengthError(newPassword) : null;
    if (passwordError) return setError(passwordError);
    // [E0.5 ⑥] 강제 변경 흐름의 프로필 검증 — 가입 폼과 동일 규칙(이메일 형식·전화 010-1234-5678).
    if (forced) {
      if (!profileDraft.name.trim()) return setError("이름을 입력해 주세요.");
      if (!emailNormalized || !isValidEmailFormat(emailNormalized)) return setError("이메일 형식이 올바르지 않습니다.");
      if (!profileDraft.phone.trim() || !isValidKrPhone(profileDraft.phone)) {
        return setError("전화번호는 010-1234-5678 형식으로 입력해 주세요.");
      }
      const year = profileDraft.birthYear?.trim();
      if (year && !isValidBirthYear(year)) {
        return setError(`출생연도는 ${BIRTH_YEAR_MIN}~${BIRTH_YEAR_MAX} 사이 4자리로 입력해 주세요.`);
      }
      // [2026-07-16] 설정할 이메일의 OTP 인증 필수(서버도 400로 강제) — 대상 일치까지 확인.
      if (!otp || !emailVerifiedForCurrentTarget) {
        return setError("이메일 인증을 먼저 완료해 주세요. (인증 코드 발송 → 코드 확인)");
      }
    }
    // [E0] 평시 비밀번호 변경 = 본인 이메일 OTP 필수(서버도 동일 검증 — 소비는 같은 tx).
    if (!forced && (!otp || !otpVerified)) {
      return setError("본인 이메일 인증을 먼저 완료해 주세요. (인증 코드 발송 → 코드 확인)");
    }
    setBusy(true);
    try {
      await changeCredentials.mutateAsync({
        currentPassword,
        ...(forced && nextWebId ? { newWebId: nextWebId } : {}),
        ...(newPassword ? { newPassword } : {}),
        ...(forced
          ? {
              name: profileDraft.name.trim(),
              email: emailNormalized,
              phone: profileDraft.phone.trim(),
              ...(profileDraft.countryCode ? { countryCode: profileDraft.countryCode } : {}),
              ...(profileDraft.timeZone ? { timeZone: profileDraft.timeZone } : {}),
              ...(profileDraft.university?.trim() ? { university: profileDraft.university.trim() } : {}),
              ...(profileDraft.major?.trim() ? { major: profileDraft.major.trim() } : {}),
              ...(profileDraft.birthYear?.trim() ? { birthYear: Number(profileDraft.birthYear.trim()) } : {}),
            }
          : {}),
        ...(otp ? { verificationChallengeId: otp.id } : {}),
      });
      clearToken();
      setCurrentAccount(null);
      queryClient.clear();
      resetPreferences(); // [E0 storage 감사] 자격증명 변경 후 재로그인 전 정리
      router.replace("/login?credentialsChanged=1");
    } catch (caught) {
      setError(apiErrorMessage(caught, "계정 정보를 변경하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  // OTP 코드 확인 행 — forced(이메일 필드 아래)·평시(본인 확인 섹션) 공용.
  const otpCodeRow = otp && !(forced ? emailVerifiedForCurrentTarget : otpVerified) ? (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label="인증 코드">
          <input
            className="input w-full mono tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="6자리 숫자"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <button type="button" className="btn btn-sm shrink-0" onClick={confirmOtp} disabled={busy}>코드 확인</button>
      <button type="button" className="btn btn-sm shrink-0" onClick={sendOtp} disabled={busy}>재전송</button>
    </div>
  ) : null;

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <PageHeader
        title="계정 보안"
        sub={forced ? "첫 로그인입니다. 계정 정보를 한 번에 설정해 주세요." : "비밀번호를 변경합니다. (본인 이메일 인증 필요)"}
      />
      <form className="card card-pad space-y-4" onSubmit={submit}>
        <Field label="현재 비밀번호"><input className="input w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus /></Field>
        {forced ? (
          <Field label="새 아이디"><input className="input w-full" autoComplete="username" required minLength={3} maxLength={50} value={newWebId} onChange={(e) => setNewWebId(e.target.value)} /></Field>
        ) : (
          // [E0] 평시 아이디 변경은 승인제 — 마이 페이지의 프로필 변경 요청으로 이동.
          <p className="text-caption text-fg-muted">
            아이디 변경은 <Link href="/account" className="text-accent hover:underline">마이 페이지 → 프로필 변경</Link>에서
            요청할 수 있습니다(대표 승인 후 적용 · 재로그인 필요).
          </p>
        )}
        <Field label="새 비밀번호"><input className="input w-full" type="password" autoComplete="new-password" required maxLength={72} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <Field label="새 비밀번호 확인"><input className="input w-full" type="password" autoComplete="new-password" required maxLength={72} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        {forced ? (
          <div className="border-t pt-4 space-y-4">
            {/* [2026-07-16 대표 추가요청] users 수정 가능 컬럼 전부 + 이메일 인증 — 공용 필드 컴포넌트 재사용 */}
            <p className="text-caption text-fg-muted">프로필 정보 — 비밀번호 찾기·알림 수신·캘린더 시간대에 사용됩니다.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileDetailsFields
                values={profileDraft}
                onPatch={(patch) => {
                  patchProfile(patch);
                  // 인증된 이메일을 수정하면 인증 무효 — 대상 불일치 상태를 즉시 반영.
                  if (patch.email !== undefined) setOtpVerified(false);
                }}
                countries={countriesQuery.data ?? []}
                countriesPending={countriesQuery.isPending}
                roleLabel={myRole ? roleLabel[myRole] : undefined}
                extended
                requireAll
                emailAction={{
                  label: emailVerifiedForCurrentTarget ? "인증 완료" : busy ? "발송 중..." : otp && otpTarget === emailNormalized ? "재전송" : "인증 코드 발송",
                  disabled: busy || emailVerifiedForCurrentTarget || !emailNormalized,
                  onClick: sendOtp,
                }}
                emailHint={emailVerifiedForCurrentTarget ? "이메일 인증 완료 — 설정을 완료하면 이 주소가 등록됩니다." : "설정할 이메일로 본인 인증이 필요합니다."}
                phoneHint="010-1234-5678 형식"
              />
            </div>
            {otpCodeRow}
          </div>
        ) : (
          <div className="border-t pt-4 space-y-3">
            {/* [E0] 본인 이메일 OTP — 등록된 이메일로 발송(대상 입력 없음), verified 후 제출 가능 */}
            <p className="text-caption text-fg-muted">본인 확인 — 등록된 이메일로 인증 코드를 받아 입력해 주세요.</p>
            {otpVerified ? (
              <p className="text-body text-success" role="status">이메일 인증 완료</p>
            ) : otp ? (
              otpCodeRow
            ) : (
              <button type="button" className="btn btn-sm" onClick={sendOtp} disabled={busy}>
                {busy ? "발송 중..." : "인증 코드 발송"}
              </button>
            )}
          </div>
        )}
        {notice && <p className="text-caption text-success" role="status">{notice}</p>}
        {error && <p className="text-body text-danger" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn" onClick={logout} disabled={busy}>로그아웃</button>
          <button className="btn btn-primary" disabled={busy || (forced ? !emailVerifiedForCurrentTarget : !otpVerified)}>
            {busy ? "변경 중..." : forced ? "계정 정보 설정 완료" : "비밀번호 변경"}
          </button>
        </div>
      </form>
    </div>
  );
}
