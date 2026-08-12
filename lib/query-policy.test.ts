import axios from "axios";
import { describe, expect, it } from "vitest";
import { LIVE_SERVER_STATE_INTERVAL_MS, serverStateRefetchInterval, shouldRetryQuery } from "./query-policy";

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

describe('serverStateRefetchInterval', () => {
  it('승인·스케줄 등 DB 업무 상태는 활성 화면에서 주기 재검증한다', () => {
    expect(serverStateRefetchInterval(['auth', 'pending'])).toBe(LIVE_SERVER_STATE_INTERVAL_MS);
    expect(serverStateRefetchInterval(['schedule', 'list', 'manager'])).toBe(LIVE_SERVER_STATE_INTERVAL_MS);
    expect(serverStateRefetchInterval(['scheduleRequests', 'list', 'manager'])).toBe(LIVE_SERVER_STATE_INTERVAL_MS);
  });

  it('공개 입력 검증과 정적 국가 카탈로그는 폴링하지 않는다', () => {
    expect(serverStateRefetchInterval(['auth', 'signup-config'])).toBe(false);
    expect(serverStateRefetchInterval(['auth', 'web-id-available', 'test'])).toBe(false);
    expect(serverStateRefetchInterval(['catalog', 'countries'])).toBe(false);
  });
});
