import { describe, expect, it } from "vitest";
import type { ScheduleResource } from "@/types";
import { countryByCode } from "./tz";
import { axisCompanionTimezone, buildTimezonePaneGroups, resourceTimezoneKey, resourceTimezoneOf, timezoneCountryFromResource } from "./resource-timezone";

const instructor = (patch: Partial<ScheduleResource> = {}): ScheduleResource => ({
  type: "instructor",
  id: 2,
  name: "정유진",
  countryCode: "GB",
  timeZone: "Europe/London",
  ...patch,
});

describe("resource timezone resolver", () => {
  it("uses schedule resource country metadata for instructors and students", () => {
    expect(resourceTimezoneOf(instructor(), {})?.tz).toBe("Europe/London");
    expect(resourceTimezoneOf({ type: "student", id: 1, name: "김서연", countryCode: "US" }, {})?.tz).toBe("America/New_York");
  });

  it("allows per-resource KST or country overrides", () => {
    const key = resourceTimezoneKey("instructor", 2);
    expect(resourceTimezoneOf(instructor(), { [key]: null })).toBeUndefined();
    expect(resourceTimezoneOf(instructor(), { [key]: countryByCode("US-W") ?? null })?.tz).toBe("America/Los_Angeles");
  });

  it("falls back to explicit timezone metadata when country code is unavailable", () => {
    expect(timezoneCountryFromResource(instructor({ countryCode: undefined, timeZone: "Europe/Berlin" }))?.tz).toBe("Europe/Berlin");
  });

  it("uses a single owner timezone as the KST axis companion label", () => {
    const gb = countryByCode("GB");
    expect(axisCompanionTimezone([gb, gb, undefined])?.code).toBe("GB");
  });

  it("does not collapse mixed owner timezones into one KST axis companion label", () => {
    expect(axisCompanionTimezone([countryByCode("GB"), countryByCode("US")])).toBeUndefined();
  });

  it("prefers table-level timezone for the KST axis companion label", () => {
    expect(axisCompanionTimezone([countryByCode("GB")], countryByCode("US-W"))?.code).toBe("US-W");
  });

  it("reuses the same timezone split rule for instructors and students", () => {
    const groups = buildTimezonePaneGroups(
      [
        { dim: "instructor" as const, picks: [{ id: 1 }, { id: 2 }] },
        { dim: "student" as const, picks: [{ id: 10 }, { id: 11 }] },
      ],
      (dim, id) => {
        if (dim === "instructor") return id === 1 ? countryByCode("KR") : countryByCode("GB");
        return countryByCode("US");
      },
    );

    expect(groups.map((group) => [group.dim, group.picks.map((pick) => pick.id)])).toEqual([
      ["instructor", [1]],
      ["instructor", [2]],
      ["student", [10, 11]],
    ]);
  });

  it("keeps the normal sub-column view when every selected resource shares a timezone", () => {
    expect(buildTimezonePaneGroups(
      [{ dim: "instructor" as const, picks: [{ id: 1 }, { id: 2 }] }],
      () => countryByCode("GB"),
    )).toEqual([]);
  });

  it("[C4.5] groups same-timezone members into one pane and splits only differing timezones", () => {
    const groups = buildTimezonePaneGroups(
      [{ dim: "instructor" as const, picks: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }],
      (_dim, id) => (id <= 2 ? countryByCode("KR") : id === 3 ? countryByCode("GB") : countryByCode("US")),
    );
    // KST 2명 = 한 표(서브컬럼), GB·US는 각각 별도 표 — 강사·학생 공통 규칙
    expect(groups.map((group) => [group.picks.map((pick) => pick.id), group.country?.code ?? "KR"])).toEqual([
      [[1, 2], "KR"],
      [[3], "GB"],
      [[4], "US"],
    ]);
  });
});
