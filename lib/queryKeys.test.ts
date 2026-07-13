import { describe, expect, it } from "vitest";
import { qk } from "./queryKeys";

describe("queryKeys", () => {
  it("scheduleRequests list key includes auth scope to prevent role cache bleed", () => {
    expect(qk.scheduleRequests.list("1:instructor")).toEqual(["scheduleRequests", "list", "1:instructor"]);
    expect(qk.scheduleRequests.list("4:manager")).toEqual(["scheduleRequests", "list", "4:manager"]);
    expect(qk.scheduleRequests.list("1:instructor")).not.toEqual(qk.scheduleRequests.list("4:manager"));
  });

  it("availability read key includes auth scope to prevent account-switch cache bleed", () => {
    expect(qk.availability.everything("1:instructor")).toEqual(["availability", "all", "1:instructor"]);
    expect(qk.availability.everything("3:admin")).not.toEqual(qk.availability.everything("1:instructor"));
  });
});
