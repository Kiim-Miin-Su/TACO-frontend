import type { ReactNode } from 'react';

/**
 * PageHeader — 페이지 상단 헤더 단일 규격 (DESIGN.md §4·§5).
 * 제목(text-title font-bold) + 부제(text-caption) + 우측 액션.
 * 금지: 뷰마다 수기 헤더 마크업 작성, 부제에 조작 설명서 상주(팝오버로 이동).
 */
type PageHeaderProps = {
  title: string;
  /** 한 줄 요약 — 기간·건수 등 상태 정보만. 설명서 금지 */
  sub?: ReactNode;
  /** 우측 액션(버튼·배지). flex row로 배치됨 */
  actions?: ReactNode;
};

export function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5 sm:items-end">
      {/* [TBO-104 1D] min-w-0 flex-1: 부제가 길어져도 좌측 열이 줄어들 뿐 actions를 다음 줄로 밀지 않는다.
          부제가 줄바꿈되면 헤더 높이가 변해 pointerdown~pointerup 사이 레이아웃이 이동하고 첫 클릭이 소실된다. */}
      <div className="min-w-0 flex-1">
        <h1 className="text-title font-bold">{title}</h1>
        {sub && <p className="mt-0.5 break-keep text-caption text-fg-muted">{sub}</p>}
      </div>
      {actions && (
        <div className="page-header-actions -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {actions}
        </div>
      )}
    </div>
  );
}
