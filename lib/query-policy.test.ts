import axios from "axios";
import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./query-policy";

describe("shouldRetryQuery", () => {
  it("does not retry canceled or client-contract failures", () => {
    expect(shouldRetryQuery(0, new axios.CanceledError())).toBe(false);
    expect(shouldRetryQuery(0, new axios.AxiosError("conflict", "409", undefined, undefined, { status: 409 } as never))).toBe(false);
  });

  it("retries a transient failure only once", () => {
    expect(shouldRetryQuery(0, new Error("network"))).toBe(true);
    expect(shouldRetryQuery(1, new Error("network"))).toBe(false);
  });
});
