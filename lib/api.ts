// 백엔드(NestJS)와 분리 운영. next.config.ts의 rewrites가 /api/* → API 서버로 프록시.
// 데스크탑 전환 시 BASE만 절대 URL로 바꾸면 됩니다.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  students: {
    list: () => request<unknown[]>("/students"),
    create: (body: Record<string, unknown>) => request("/students", { method: "POST", body: JSON.stringify(body) }),
  },
  enrollments: {
    list: () => request<unknown[]>("/enrollments"),
    create: (body: Record<string, unknown>) => request("/enrollments", { method: "POST", body: JSON.stringify(body) }),
  },
  payments: {
    list: () => request<unknown[]>("/payments"),
  },
};
