// [B7 E3 2026-07-16] 상세 화면 공통 상태 셸 — 단건 query의 로딩/404/403/오류를 구분 렌더한다.
//  종전엔 상세 6뷰가 full-list find + 자체 "없습니다" 가드라 로드 중에도 '없음'으로 보일 수
//  있었고(빈 상태 오인 — E0.6 H2의 상세판), 404/403/네트워크 오류가 구분되지 않았다.
//  규약: 같은 키 background refresh는 TanStack 기본대로 기존 데이터 유지, 다른 id로 이동하면
//  skeleton(이전 엔티티를 잠시 보여주는 keepPreviousData는 오표시 위험이라 의도적으로 미사용).
"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

type DetailQueryLike<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

export function DetailStates<T>({
  query,
  notFoundMessage,
  forbiddenMessage = "접근 권한이 없습니다 — 본인 담당 항목만 조회할 수 있습니다.",
  backHref,
  backLabel = "목록으로",
  children,
}: {
  query: DetailQueryLike<T>;
  /** 404 문구 — 도메인별로 지정(예: "학생을 찾을 수 없습니다"). */
  notFoundMessage: string;
  forbiddenMessage?: string;
  /** 404/403 시 복귀 링크(목록 라우트). */
  backHref?: string;
  backLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState rows={6} />;
  if (query.isError) {
    const status = statusOf(query.error);
    const back = backHref ? (
      <Link href={backHref} className="btn btn-sm">{backLabel}</Link>
    ) : undefined;
    if (status === 404) return <EmptyState message={notFoundMessage} action={back} />;
    if (status === 403) return <EmptyState message={forbiddenMessage} action={back} />;
    return (
      <EmptyState
        message="불러오지 못했습니다 — 네트워크 또는 서버 상태를 확인해 주세요."
        action={(
          <span className="inline-flex gap-2">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => query.refetch()}>다시 시도</button>
            {back}
          </span>
        )}
      />
    );
  }
  if (query.data == null) return <EmptyState message={notFoundMessage} />; // 방어(성공+빈 응답)
  return <>{children(query.data)}</>;
}
