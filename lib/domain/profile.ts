import type {
  CreateProfileChangeRequestBody,
  MyProfile,
  ProfileChangeFields,
  ProfileChangeRequest,
  UserProfileSummary,
} from "@/lib/api";
import type { Tone } from "@/components/ui/tokens";

export const PROFILE_FIELD_LABEL: Record<keyof ProfileChangeFields, string> = {
  name: "이름",
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

const PROFILE_FIELDS = ["name", "phone", "countryCode", "timeZone"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileChangeDraft = Record<ProfileField, string> & { reason: string };

const normalize = (field: ProfileField, value?: string | null) => {
  const trimmed = (value ?? "").trim();
  return field === "countryCode" ? trimmed.toUpperCase() : trimmed;
};

export function buildProfileChangePayload(
  profile: MyProfile,
  draft: ProfileChangeDraft,
): { payload?: CreateProfileChangeRequestBody; error?: string } {
  const reason = draft.reason.trim();
  if (reason.length < 5) return { error: "변경 사유는 5자 이상 입력해 주세요." };
  if (reason.length > 500) return { error: "변경 사유는 500자 이하여야 합니다." };

  const changes: ProfileChangeFields = {};
  for (const field of PROFILE_FIELDS) {
    const next = normalize(field, draft[field]);
    const current = normalize(field, profile[field]);
    if (next !== current) {
      (changes as Record<ProfileField, string | null | undefined>)[field] = field === "name" || next ? next : null;
    }
  }
  if (changes.name === "") return { error: "이름은 비워 둘 수 없습니다." };
  if (changes.countryCode != null && !/^[A-Z][A-Z0-9-]{1,7}$/.test(changes.countryCode)) {
    return { error: "국가 코드는 KR, US-W처럼 2~8자로 입력해 주세요." };
  }
  if (Object.keys(changes).length === 0) return { error: "변경할 프로필 항목을 입력해 주세요." };
  return { payload: { ...changes, reason } };
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
