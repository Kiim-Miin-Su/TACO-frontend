import { describe, expect, it } from "vitest";
import { qk } from "./queryKeys";

describe("queryKeys", () => {
  it("scheduleRequests list key includes auth scope to prevent role cache bleed", () => {
    expect(qk.scheduleRequests.list("1:instructor")).toEqual(["scheduleRequests", "list", "1:instructor"]);
    expect(qk.scheduleRequests.list("4:manager")).toEqual(["scheduleRequests", "list", "4:manager"]);
    expect(qk.scheduleRequests.list("1:instructor")).not.toEqual(qk.scheduleRequests.list("4:manager"));
  });
});
