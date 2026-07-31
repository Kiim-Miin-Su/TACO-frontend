// [참조/처리] 전역 TanStack Query Provider(layout이 AppShell을 이 안에 래핑).
//  - QueryClient 기본 옵션(staleTime 30s·retry 1·포커스 재패칭 off)을 여기서 1회 생성해 전 컴포넌트가 공유.
//  - AppShell의 useQuery/useMutation, EventsView 발행 폼 등이 이 클라이언트로 캐시·무효화를 공유.
"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { shouldRetryQuery } from "@/lib/query-policy";

// [TBO-58 P2 2026-07-24] 전역 미처리 에러 수집 — 종전엔 unhandledrejection(비동기 실패)이 무기록.
//  콘솔 1줄([fe] unhandled…)만 — PII·스택 원문 미전송, 같은 메시지 연속 중복은 억제.
function useGlobalErrorLogging(): void {
  useEffect(() => {
    let lastLine = "";
    const line = (kind: string, message: string) => {
      const text = `[fe] ${kind} message=${message}`;
      if (text === lastLine) return; // 렌더 루프성 중복 억제
      lastLine = text;
      console.error(text);
    };
    const onRejection = (e: PromiseRejectionEvent) =>
      line("unhandled-rejection", e.reason instanceof Error ? e.reason.message : String(e.reason).slice(0, 200));
    const onError = (e: ErrorEvent) => line("window-error", e.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
}

// 앱 전역 TanStack Query 클라이언트. 서버 데이터(스케줄·정산·목록 등)의 캐싱·재검증·
// 낙관적 업데이트를 담당한다. (목데이터를 백엔드로 이관하며 점진 도입 — lib/queryKeys)
export default function Providers({ children }: { children: React.ReactNode }) {
  useGlobalErrorLogging(); // [TBO-58 P2]
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30초 동안은 캐시를 신선한 것으로 간주(불필요한 재요청 억제)
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
