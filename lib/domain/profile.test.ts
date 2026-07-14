import { describe, expect, it } from "vitest";
import type { MyProfile, ProfileChangeRequest } from "@/lib/api";
import { buildProfileChangePayload, profileRequestDiff, profileRequestedSummary } from "./profile";

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

describe("buildProfileChangePayload", () => {
  it("sends only changed flat fields and trims the required reason", () => {
    const result = buildProfileChangePayload(profile, {
      name: profile.name,
      phone: " 010-9999-0000 ",
      countryCode: "kr",
      timeZone: profile.timeZone ?? "",
      reason: "  연락처 변경  ",
    });
    expect(result).toEqual({ payload: { phone: "010-9999-0000", reason: "연락처 변경" } });
  });

  it("rejects empty reasons and no-op changes", () => {
    const unchanged = { name: profile.name, phone: profile.phone ?? "", countryCode: "KR", timeZone: "Asia/Seoul", reason: "" };
    expect(buildProfileChangePayload(profile, unchanged).error).toContain("사유");
    expect(buildProfileChangePayload(profile, { ...unchanged, reason: "변경 없음 확인" }).error).toContain("변경할");
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
