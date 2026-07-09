import { describe, expect, it } from "vitest";
import type { ScheduleResource } from "@/types";
import { countryByCode } from "./tz";
import { axisCompanionTimezone, resourceTimezoneKey, resourceTimezoneOf, timezoneCountryFromResource } from "./resource-timezone";

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
});
