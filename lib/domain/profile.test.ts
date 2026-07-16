import { describe, expect, it } from "vitest";
import type { MyProfile, ProfileChangeRequest } from "@/lib/api";
import { buildProfileChangePayload, contactVerificationPlanOf, profileRequestDiff, profileRequestedSummary } from "./profile";

const profile: MyProfile = {
  id: 7,
  webId: "teacher7",
  name: "박지훈",
  email: "teacher@example.com",
  phone: "010-1111-2222",
  role: "instructor",
  status: "active",
  countryCode: "KR",
  timeZone: "Asia/Seoul",
  profileVersion: 3,
};

const request: ProfileChangeRequest = {
  id: 11,
  requesterId: 7,
  beforeValues: { phone: "010-1111-2222", timeZone: "Asia/Seoul" },
  requestedChanges: { phone: "010-9999-0000", timeZone: "America/New_York" },
  reason: "해외 체류",
  baseProfileVersion: 3,
  status: "pending",
  createdAt: "2026-07-14T01:00:00.000Z",
  updatedAt: "2026-07-14T01:00:00.000Z",
};

const baseDraft = {
  name: profile.name,
  webId: profile.webId, // [E0] 아이디 변경 — 승인제 필드 편입
  email: profile.email ?? "",
  phone: profile.phone ?? "",
  countryCode: profile.countryCode ?? "",
  timeZone: profile.timeZone ?? "",
  reason: "변경 사유입니다",
};

describe("buildProfileChangePayload", () => {
  it("sends only changed flat fields and trims the required reason", () => {
    const result = buildProfileChangePayload(profile, {
      ...baseDraft,
      phone: " 010-9999-0000 ",
      countryCode: "kr",
      reason: "  연락처 변경  ",
    });
    expect(result).toEqual({ payload: { phone: "010-9999-0000", reason: "연락처 변경" } });
  });

  it("rejects empty reasons and no-op changes", () => {
    const unchanged = { ...baseDraft, reason: "" };
    expect(buildProfileChangePayload(profile, unchanged).error).toContain("사유");
    expect(buildProfileChangePayload(profile, { ...unchanged, reason: "변경 없음 확인" }).error).toContain("변경할");
  });

  // [TBO-29B-4] 이메일 변경 — 소문자 정규화·형식 검증·비우기 금지·phone 동시 변경 금지
  it("normalizes a changed email to lowercase and validates its format", () => {
    expect(buildProfileChangePayload(profile, { ...baseDraft, email: " New@TnAcademy.Test " })).toEqual({
      payload: { email: "new@tnacademy.test", reason: "변경 사유입니다" },
    });
    expect(buildProfileChangePayload(profile, { ...baseDraft, email: "broken@" }).error).toContain("이메일 형식");
    expect(buildProfileChangePayload(profile, { ...baseDraft, email: "" }).error).toContain("비워");
  });

  it("rejects malformed phones and simultaneous email+phone changes", () => {
    expect(buildProfileChangePayload(profile, { ...baseDraft, phone: "abc" }).error).toContain("010-1234-5678");
    // [2026-07-16 SENS 준비] 국제 E.164(+국가코드, 공백 허용) 복원 — 해외 강사/학생 번호
    expect(buildProfileChangePayload(profile, { ...baseDraft, phone: "+44 7911 123456" }).payload?.phone).toBe("+44 7911 123456");
    expect(buildProfileChangePayload(profile, { ...baseDraft, phone: "+0 123" }).error).toContain("010-1234-5678");
    expect(buildProfileChangePayload(profile, { ...baseDraft, phone: "010-9999-0000" }).payload?.phone).toBe("010-9999-0000");
    expect(
      buildProfileChangePayload(profile, { ...baseDraft, email: "new@tnacademy.test", phone: "010-9999-0000" }).error,
    ).toContain("하나씩만");
  });

  // [E0] 아이디(webId) — 승인제 요청 필드. 3자 미만 거부·변경 시 diff 포함.
  it("accepts webId changes (approval path) and rejects too-short ids", () => {
    expect(buildProfileChangePayload(profile, { ...baseDraft, webId: "new_teacher7" })).toEqual({
      payload: { webId: "new_teacher7", reason: "변경 사유입니다" },
    });
    expect(buildProfileChangePayload(profile, { ...baseDraft, webId: "ab" }).error).toContain("3자");
  });
});

describe("contactVerificationPlanOf", () => {
  it("email은 항상 challenge — phone은 BE SMS 가용 플래그로 동적(가용 시 sms plan, 아니면 승인 처리)", () => {
    expect(contactVerificationPlanOf({ email: "new@tnacademy.test", reason: "r" })).toEqual({ channel: "email", target: "new@tnacademy.test" });
    // [2026-07-16 SENS 준비] smsAvailable=false(기본) → 인증 없이 접수(관리자 승인 처리)
    expect(contactVerificationPlanOf({ phone: "010-9999-0000", reason: "r" })).toBeNull();
    expect(contactVerificationPlanOf({ phone: "010-9999-0000", reason: "r" }, false)).toBeNull();
    // smsAvailable=true(provider env 완비) → sms challenge 계획
    expect(contactVerificationPlanOf({ phone: "010-9999-0000", reason: "r" }, true)).toEqual({ channel: "sms", target: "010-9999-0000" });
    expect(contactVerificationPlanOf({ phone: null, reason: "r" }, true)).toBeNull(); // 비우기는 인증 불요
    expect(contactVerificationPlanOf({ name: "박지훈", timeZone: "Asia/Seoul", reason: "r" }, true)).toBeNull();
  });
});

describe("profile request display", () => {
  it("compares only requested fields with current user values", () => {
    expect(profileRequestDiff(request, profile)).toEqual([
      { field: "phone", label: "연락처", current: "010-1111-2222", requested: "010-9999-0000" },
      { field: "timeZone", label: "시간대", current: "Asia/Seoul", requested: "America/New_York" },
    ]);
    expect(profileRequestedSummary(request)).toBe("연락처, 시간대");
  });
});
