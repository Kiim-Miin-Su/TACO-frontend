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
    <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-title font-bold">{title}</h1>
        {sub && <p className="text-caption text-fg-muted mt-0.5">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
