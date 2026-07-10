import { describe, expect, it } from "vitest";
import { availabilityRequestDiff, requestStatusHelp, requestStatusTone } from "./approvals";

const block = { kind: "available", weekday: 3, startTime: "14:00", endTime: "20:00" };

describe("availabilityRequestDiff — 승인센터 상세 before→after", () => {
  it("upsert(시간 축소): 시간만 changed, 종류·요일은 불변", () => {
    const rows = availabilityRequestDiff(
      {
        requestKind: "availability_upsert", targetAvailabilityId: 11,
        availabilityKind: "available", availabilityWeekday: 3,
        availabilityStartTime: "14:00", availabilityEndTime: "16:00",
      },
      block,
    );
    expect(rows.find((r) => r.label === "시간")).toEqual({ label: "시간", before: "14:00–20:00", after: "14:00–16:00", changed: true });
    expect(rows.find((r) => r.label === "종류")?.changed).toBe(false);
    expect(rows.find((r) => r.label === "요일")).toMatchObject({ before: "수", after: "수", changed: false });
  });

  it("delete: after 전항목 '(삭제)' + before는 현재 블록 값", () => {
    const rows = availabilityRequestDiff({ requestKind: "availability_delete", targetAvailabilityId: 11 }, block);
    expect(rows.every((r) => r.after === "(삭제)" && r.changed)).toBe(true);
    expect(rows.find((r) => r.label === "종류")?.before).toBe("가용시간");
  });

  it("신규 upsert(대상 블록 없음): before '(신규)'", () => {
    const rows = availabilityRequestDiff(
      {
        requestKind: "availability_upsert",
        availabilityKind: "online_only", availabilityWeekday: 5,
        availabilityStartTime: "20:00", availabilityEndTime: "21:30",
      },
      null,
    );
    expect(rows.find((r) => r.label === "종류")).toMatchObject({ before: "(신규)", after: "온라인만 가능", changed: true });
  });

  it("적용 기간: 미지정=상시(매주), 지정 시 범위 문자열", () => {
    const rows = availabilityRequestDiff(
      {
        requestKind: "availability_upsert", availabilityKind: "available", availabilityWeekday: 1,
        availabilityStartTime: "14:00", availabilityEndTime: "20:00",
        availabilityEffectiveFrom: "2026-07-13", availabilityEffectiveTo: "2026-08-31",
      },
      block,
    );
    expect(rows.find((r) => r.label === "적용 기간")).toMatchObject({ before: "상시(매주)", after: "2026-07-13 ~ 2026-08-31", changed: true });
  });
});

describe("requester-facing request status helpers", () => {
  it("maps authoritative approval status to stable UI tone", () => {
    expect(requestStatusTone("pending")).toBe("attention");
    expect(requestStatusTone("approved")).toBe("success");
    expect(requestStatusTone("rejected")).toBe("danger");
    expect(requestStatusTone(undefined)).toBe("neutral");
  });

  it("keeps rejected reason visible without changing approval truth", () => {
    expect(requestStatusHelp("pending")).toContain("검토 대기");
    expect(requestStatusHelp("approved")).toContain("반영");
    expect(requestStatusHelp("rejected", "시간 충돌")).toContain("시간 충돌");
  });
});
