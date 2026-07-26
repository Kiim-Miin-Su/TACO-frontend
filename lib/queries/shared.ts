"use client";
// 도메인 훅 파일들이 공유하는 내부 헬퍼 — lib/queries.ts에서 분할(순수 이동).
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

// ── 도메인 읽기 훅 (뷰는 { data = [] } 형태로 구독) ──
// [감사 M10] 준정적 카탈로그(과목·코스·강의실·학생·보호자)는 staleTime 5분 — 변경 빈도가 낮고
//  쓰기 훅이 invalidate로 즉시 갱신하므로 안전. 나머지는 전역 기본(30s, app/providers.tsx).
export const CATALOG_STALE = 5 * 60 * 1000;

// ── [B7 E3] 상세 단건 훅 — full-list 후 클라 find 대체. 404/403은 axios 에러로 흘러
//  DetailStates가 구분 렌더한다. 규약: 404/403은 최종 상태라 재시도하지 않음(무의미한 재요청 차단).
//  키는 도메인 루트 하위 — 기존 쓰기 훅의 .all 루트 무효화가 상세도 자동 갱신(별도 배선 불요).
export const detailRetry = (failureCount: number, error: unknown) => {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404 || status === 403) return false;
  return failureCount < 2;
};

// ── 뮤테이션 훅 (중앙화) ──
// 쓰기는 전부 백엔드 API 경유 + 성공 시 관련 queryKey invalidate → Query(및 store 하이드레이션) 자동 갱신.
// 각 뷰는 아래 훅만 호출(useMutation+invalidate 반복 제거 = 함수 통일).
// [B6 C2/EP5] refetchType "active"로 query-cache 헬퍼와 정책 일원화 — 종전 미지정(all)은 비활성
//  화면의 쿼리까지 즉시 refetch했다. invalidate 표시는 남으므로 비활성 쿼리는 다음 마운트에 재조회.
export function useInvalidator(keys: QueryKey[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: key, refetchType: "active" })));
}
