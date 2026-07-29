import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearAccountScopedClientState } from "./auth-session";

vi.mock("@/lib/storage/preferences", () => ({
  resetPreferences: vi.fn(),
}));

describe("clearAccountScopedClientState", () => {
  it("이전 계정의 진행 요청을 취소한 뒤 모든 서버 캐시를 제거한다", async () => {
    const client = new QueryClient();
    client.setQueryData(["schedule", "list", "admin"], [{ id: 1 }]);
    client.setQueryData(["students", "list"], [{ id: 2 }]);
    const cancel = vi.spyOn(client, "cancelQueries");

    await clearAccountScopedClientState(client);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
