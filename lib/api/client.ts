// 백엔드(NestJS) REST 클라이언트 — Axios.
// 브라우저는 항상 same-origin `/api`만 호출한다. next.config rewrite가 server-side로 backend에 전달해
// HttpOnly session cookie가 frontend origin에 귀속되고 cross-origin token 노출을 없앤다.
import axios, { type AxiosRequestConfig } from "axios";
import { logger } from "../log";
import { safeLogValue, safeUrlForLog } from "../log-redaction";
import { isPublicRoute } from "../auth-routes";
import { resetPreferences } from "../storage/preferences";
import { isSudoRequiredError } from "../sudo";

export type ApiReadOptions = Pick<AxiosRequestConfig, "signal">;

export const http = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  // access/refresh token은 HttpOnly cookie로만 운반한다. same-origin BFF 요청에도 credentials를 명시해
  // 브라우저 정책과 테스트 adapter에서 cookie 동봉 의도를 고정한다.
  withCredentials: true,
});

// [TBO-34 C1] access cookie 만료(401) 시 HttpOnly refresh cookie를 회전해 새 access cookie를 받는다.
// raw token은 JavaScript 응답/상태에 존재하지 않는다. 단일 비행 후 원 요청을 cookie로 1회 재시도한다.
let refreshInFlight: Promise<boolean> | null = null;
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post("/api/auth/refresh", {}, { withCredentials: true, timeout: 10000 })
      .then(() => true)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout)/;

// 모든 API 요청/응답/에러를 한 곳에서 로깅 — 문제 발생 시 콘솔에서 어떤 호출이 실패했는지 즉시 확인.
// (브라우저 콘솔에서 [TACO:api] 로 필터. 운영 debug 플래그는 lib/storage/preferences에서 관리)
const apiLog = logger("api");
// [R3 2026-07-06] network 계측 — 요청 개수·시작 시각(응답에서 duration 산출). PII·바디 미기록.
let reqSeq = 0;
let expiredRedirectStarted = false;
type MetaConfig = { meta?: { seq: number; start: number } };

http.interceptors.request.use((cfg) => {
  (cfg as unknown as MetaConfig).meta = { seq: ++reqSeq, start: Date.now() };
  // [TBO-58 P2] rid 상관관계 — 서버 로그와 브라우저 콘솔을 같은 rid로 교차 대조(BE request-context 수용 형식).
  const rid = `fe-${Date.now().toString(36)}-${reqSeq}`;
  cfg.headers.set?.("X-Request-Id", rid);
  apiLog.debug(`→ ${cfg.method?.toUpperCase()} ${safeUrlForLog(cfg.url)} rid=${rid}`, safeLogValue(cfg.params ?? cfg.data ?? ""));
  return cfg;
});
http.interceptors.response.use(
  (res) => {
    // [R3] category=http 계측: #요청번호 · duration(ms) — "요청 개수·요청 시간·반환 시간"
    const meta = (res.config as unknown as MetaConfig).meta;
    apiLog.debug(`← ${res.status} ${res.config.method?.toUpperCase() ?? ""} ${safeUrlForLog(res.config.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}`);
    return res;
  },
  async (err) => {
    if (axios.isCancel(err)) return Promise.reject(err);
    const status = err?.response?.status ?? "ERR";
    const meta = (err?.config as unknown as MetaConfig)?.meta;
    const errRid = String(err?.response?.headers?.["x-request-id"] ?? "");
    const responseData = err?.response?.data;
    const expectedSudoChallenge = isSudoRequiredError(err);
    apiLog[expectedSudoChallenge ? "warn" : "error"](
      `✗ ${status} ${err?.config?.method?.toUpperCase() ?? ""} ${safeUrlForLog(err?.config?.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}${errRid ? ` rid=${errRid}` : ""}`,
      safeLogValue(responseData ?? err?.message),
    );
    // [대표 지시 ④] 401 → refresh 회전으로 조용한 갱신 시도(1회) — 성공 시 원 요청 재실행.
    //  auth 계열 엔드포인트 자신·이미 재시도한 요청은 제외(무한 루프 방지).
    const cfg = err?.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (
      status === 401 && cfg && !cfg._retried &&
      typeof window !== "undefined" &&
      !AUTH_ENDPOINTS.test(String(cfg.url ?? ""))
    ) {
      const renewed = await refreshAccessToken();
      if (renewed) {
        cfg._retried = true;
        return http.request(cfg);
      }
    }
    // 401(토큰 없음/만료 + 갱신 실패): 조용히 실패하지 않고 로그인으로 유도 — 세션이 끊긴 걸 사용자에게 알림.
    // 단, 로그인 시도 자체의 401(잘못된 자격)이나 공개 경로에선 리다이렉트하지 않음.
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !isPublicRoute(window.location.pathname) &&
      !String(err?.config?.url ?? "").includes("/auth/login") &&
      !expiredRedirectStarted
    ) {
      expiredRedirectStarted = true;
      resetPreferences(); // [E0 storage 감사] 세션 만료 경로도 취향 preference 정리(계정 간 누출 차단)
      window.location.assign("/login?expired=1");
    }
    return Promise.reject(err);
  },
);
