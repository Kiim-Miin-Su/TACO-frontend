// [참조/처리] 서버 상태 단일 소스 = TanStack Query. 도메인별 읽기 훅을 여기 모아
//  뷰가 store(zustand) 대신 이 훅으로 서버 데이터를 구독한다(실서비스 패턴).
//  - 쓰기(useMutation)는 Q3에서 도메인별로 추가하며 성공 시 관련 queryKey를 invalidate한다.
//  - buildTasks/navBadges/lib.reports 등 "여러 도메인 slice"가 필요한 로직은 useAppData()로 조립해 넘긴다.
"use client";
// [2026-07-26 구조 분할] 훅은 도메인 모듈(lib/queries/*)로 이동 — 이 파일은 재수출 배럴로 소비처
//  import 경로(@/lib/queries)와 export 표면을 그대로 유지한다.

// Query scope와 enabled는 AppShell의 권위 `/auth/me` 검증을 통과한 currentAccount 한 곳에서 파생한다.
// 쿠키 decode와 Zustand 기본 역할을 각각 재검사하던 이중 권한 판정은 제거했다.
export * from "./queries/students";
export * from "./queries/academics";
export * from "./queries/schedule";
export * from "./queries/finance";
export * from "./queries/admin";
export * from "./queries/misc";
