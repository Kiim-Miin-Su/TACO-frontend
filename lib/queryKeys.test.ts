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

  it("keeps requester and admin profile request caches distinct but under one invalidation root", () => {
    expect(qk.profileChangeRequests.mine("7:instructor")).toEqual(["profileChangeRequests", "mine", "7:instructor"]);
    expect(qk.profileChangeRequests.list("3:super_admin")).toEqual(["profileChangeRequests", "list", "3:super_admin"]);
    expect(qk.profileChangeRequests.detail(11, "3:super_admin")).toEqual(["profileChangeRequests", "detail", "3:super_admin", 11]);
    expect(qk.profileChangeRequests.all).toEqual(["profileChangeRequests"]);
  });
});
