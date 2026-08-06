// 백엔드(NestJS) REST 클라이언트 — Axios.
// 브라우저는 항상 same-origin `/api`만 호출한다. next.config rewrite가 server-side로 backend에 전달해
// HttpOnly session cookie가 frontend origin에 귀속되고 cross-origin token 노출을 없앤다.
import axios, { type AxiosRequestConfig } from "axios";
import { logger } from "../log";
import { safeLogValue, safeUrlForLog } from "../log-redaction";
import { isPublicRoute, sessionExpiredLogoutUrl } from "../auth-routes";
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
    // [대표 지시 ④] 401 → refresh 회전으로 조용한 갱신 시도(1회) — 성공 시 원 요청 재실행.
    //  auth 계열 엔드포인트 자신·이미 재시도한 요청은 제외(무한 루프 방지).
    const cfg = err?.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const willAttemptRefresh =
      status === 401 && !!cfg && !cfg._retried &&
      typeof window !== "undefined" &&
      !AUTH_ENDPOINTS.test(String(cfg.url ?? ""));
    // [TBO-86I-5] 갱신 예정인 401은 예상 흐름(1h access 만료마다 발생) — error 대신 debug로 낮춰
    //  "요청이 방어만 되고 콘솔 디버깅만 남는" 소음을 없앤다. 실제 오류만 error 레벨 유지.
    apiLog[expectedSudoChallenge || willAttemptRefresh ? "debug" : "error"](
      `✗ ${status} ${err?.config?.method?.toUpperCase() ?? ""} ${safeUrlForLog(err?.config?.url)} ${meta ? `${Date.now() - meta.start}ms #${meta.seq}` : ""}${errRid ? ` rid=${errRid}` : ""}${willAttemptRefresh ? " → 세션 갱신 시도" : ""}`,
      safeLogValue(responseData ?? err?.message),
    );
    if (willAttemptRefresh && cfg) {
      const renewed = await refreshAccessToken();
      if (renewed) {
        cfg._retried = true;
        return http.request(cfg);
      }
    }
    // 401(토큰 없음/만료 + 갱신 실패): 조용히 실패하지 않고 명시 로그아웃으로 유도.
    // [TBO-86I-5] /login 직행이 아니라 /logout 경유 — stale access cookie가 남아 있으면 미들웨어의
    //  존재-기반 낙관 가드가 로그인 화면을 앱으로 되튕겨(무한 bounce) 화면이 죽은 채 유지되던 결함
    //  수정. /logout이 세션 쿠키를 만료시킨 뒤 expired 안내·복귀 경로와 함께 /login을 연다.
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
      apiLog.warn("세션 만료(갱신 불가) — 명시 로그아웃 후 로그인 화면으로 이동합니다.");
      window.location.assign(sessionExpiredLogoutUrl(window.location.pathname, window.location.search));
    }
    return Promise.reject(err);
  },
);
