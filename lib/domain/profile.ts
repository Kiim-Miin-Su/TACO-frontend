import type {
  CreateProfileChangeRequestBody,
  MyProfile,
  ProfileChangeFields,
  ProfileChangeRequest,
  ProfileVerificationChannel,
  UserProfileSummary,
} from "@/lib/api";
import type { Tone } from "@/components/ui/tokens";
import { REASON_MAX, REASON_MIN, WEB_ID_MIN, isValidPhoneAny } from "@/lib/validation";

const PROFILE_FIELD_LABEL: Record<keyof ProfileChangeFields, string> = {
  name: "이름",
  webId: "아이디", // [E0] 승인제 — 승인 시 재로그인 필요
  email: "이메일",
  phone: "연락처",
  countryCode: "국가 코드",
  timeZone: "시간대",
};

export const PROFILE_STATUS_LABEL: Record<ProfileChangeRequest["status"], string> = {
  pending: "검토 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const PROFILE_STATUS_TONE: Record<ProfileChangeRequest["status"], Tone> = {
  pending: "attention",
  approved: "success",
  rejected: "danger",
};

const PROFILE_FIELDS = ["name", "webId", "email", "phone", "countryCode", "timeZone"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileChangeDraft = Record<ProfileField, string> & { reason: string };
/** currentPassword·verificationChallengeId는 모달(인증 stepper)이 조립 — 빌더는 필드 diff·형식 검증만 담당. */
export type ProfileChangePayload = Omit<CreateProfileChangeRequestBody, "currentPassword" | "verificationChallengeId">;

// [TBO-29B-4] 클라이언트 1차 형식 검증 — 권위는 서버 정규화(email lowercase·phone E.164)에 있고
//  여기서는 발송 전에 명백한 형식 오류만 거른다(백엔드 §5와 동일 계열 규칙).
export const isValidEmailFormat = (value: string) => value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
// [B6 C2 2026-07-16] 전화·사유·아이디 규칙은 lib/validation 단일 소스로 이관 — 여기선 별칭만 유지(호환).
const isValidPhoneFormat = isValidPhoneAny;

const normalize = (field: ProfileField, value?: string | null) => {
  const trimmed = (value ?? "").trim();
  if (field === "countryCode") return trimmed.toUpperCase();
  if (field === "email") return trimmed.toLowerCase();
  return trimmed;
};

export function buildProfileChangePayload(
  profile: MyProfile,
  draft: ProfileChangeDraft,
): { payload?: ProfileChangePayload; error?: string } {
  const reason = draft.reason.trim();
  if (reason.length < REASON_MIN) return { error: `변경 사유는 ${REASON_MIN}자 이상 입력해 주세요.` };
  if (reason.length > REASON_MAX) return { error: `변경 사유는 ${REASON_MAX}자 이하여야 합니다.` };

  const changes: ProfileChangeFields = {};
  for (const field of PROFILE_FIELDS) {
    const next = normalize(field, draft[field]);
    const current = normalize(field, profile[field]);
    if (next !== current) {
      (changes as Record<ProfileField, string | null | undefined>)[field] =
        field === "name" || field === "email" || field === "webId" || next ? next : null;
    }
  }
  if (changes.name === "") return { error: "이름은 비워 둘 수 없습니다." };
  // [E0] 아이디 — 승인제 요청. 서버 최소 규칙(3자)과 동일 1차 방어.
  if (changes.webId !== undefined && changes.webId !== null && changes.webId.length < WEB_ID_MIN) {
    return { error: `아이디는 ${WEB_ID_MIN}자 이상 입력해 주세요.` };
  }
  if (changes.email !== undefined && changes.email === "") return { error: "이메일은 비워 둘 수 없습니다." };
  if (changes.email && !isValidEmailFormat(changes.email)) return { error: "이메일 형식이 올바르지 않습니다." };
  if (changes.phone != null && changes.phone !== "" && !isValidPhoneFormat(changes.phone)) {
    return { error: "연락처는 010-1234-5678 또는 +국가코드 형식으로 입력해 주세요." };
  }
  // 서버 §4와 동일 — email·phone 동시 변경은 challenge 1건으로 검증 불가(한 번에 하나).
  if (changes.email !== undefined && changes.phone !== undefined) {
    return { error: "이메일과 연락처는 한 번에 하나씩만 변경할 수 있습니다." };
  }
  if (changes.countryCode != null && !/^[A-Z][A-Z0-9-]{1,7}$/.test(changes.countryCode)) {
    return { error: "국가 코드는 KR, US-W처럼 2~8자로 입력해 주세요." };
  }
  if (Object.keys(changes).length === 0) return { error: "변경할 프로필 항목을 입력해 주세요." };
  return { payload: { ...changes, reason } };
}

// [TBO-29B-4] 연락처 인증 필요 여부 — email 변경은 새 값으로 challenge, phone 비우기(null)는 인증 불요(§4).
//  [2026-07-16 SENS 준비] phone 분기는 **BE의 SMS 가용 플래그(profile.smsVerificationAvailable)로
//  동적 전환** — provider env 투입/제거만으로 BE 인증 요구와 FE 스테퍼가 함께 켜지고 꺼진다(코드 수정 0).
//  발신번호 미승인 상태에서는 env를 넣지 말 것(넣으면 인증 필수인데 발송 실패 — 변경이 막힘).
export type ContactVerificationPlan = { channel: ProfileVerificationChannel; target: string } | null;

export function contactVerificationPlanOf(payload: ProfileChangePayload, smsAvailable = false): ContactVerificationPlan {
  if (payload.email !== undefined) return { channel: "email", target: payload.email };
  if (smsAvailable && payload.phone != null) return { channel: "sms", target: payload.phone };
  return null;
}

export type ProfileDiffRow = {
  field: ProfileField;
  label: string;
  current: string;
  requested: string;
};

export function profileRequestDiff(
  request: ProfileChangeRequest,
  current?: Pick<UserProfileSummary, ProfileField> | null,
): ProfileDiffRow[] {
  return PROFILE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(request.requestedChanges, field)).map((field) => ({
    field,
    label: PROFILE_FIELD_LABEL[field],
    current: normalize(field, request.beforeValues?.[field] ?? current?.[field]) || "—",
    requested: normalize(field, request.requestedChanges[field]) || "(비움)",
  }));
}

export function profileRequestedSummary(request: ProfileChangeRequest): string {
  const labels = profileRequestDiff(request).map((row) => row.label);
  return labels.length ? labels.join(", ") : "변경 항목 없음";
}

export function formatProfileDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
