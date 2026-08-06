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

  it("isolates pay-readiness by verified account scope", () => {
    expect(qk.payouts.readiness("1:instructor")).toEqual(["payouts", "readiness", "1:instructor"]);
    expect(qk.payouts.readiness("4:manager")).not.toEqual(qk.payouts.readiness("1:instructor"));
  });

  it("keys report lists and worklists by both verified scope and server filters", () => {
    const filters = { from: '2026-07-01', studentId: 7 };
    expect(qk.reports.list(filters, '1:instructor')).toEqual([
      'reports', 'list', '1:instructor', filters,
    ]);
    expect(qk.reports.worklist(filters, '4:manager')).toEqual([
      'reports', 'worklist', '4:manager', filters,
    ]);
    expect(qk.reports.worklist(filters, '1:instructor')).not.toEqual(
      qk.reports.worklist(filters, '4:manager'),
    );
  });

  it("keeps report revisions under the report invalidation root", () => {
    expect(qk.reports.revisions(12)).toEqual(['reports', 'detail', 12, 'revisions']);
  });

  it("isolates counsel aggregate by verified account scope", () => {
    expect(qk.counsel.aggregate(7, "3:super_admin")).toEqual(["counsel", "aggregate", "3:super_admin", 7]);
    expect(qk.counsel.aggregate(7, "4:manager")).not.toEqual(qk.counsel.aggregate(7, "3:super_admin"));
  });
});
