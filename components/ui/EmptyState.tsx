import type { ReactNode } from 'react';

/**
 * EmptyState — 빈 상태 단일 규격 (DESIGN.md §5·§8).
 * 문구·톤·패딩을 통일한다. 0건 섹션은 카드 본문 대신 이 한 줄로 축약.
 * 금지: 뷰마다 "…없습니다" 수기 div.
 */
type EmptyStateProps = {
  message: string;
  /** 바로가기 등 보조 액션(선택) */
  action?: ReactNode;
  /** compact: 목록 셀 안 등 좁은 곳(p-3) / 기본 p-4 */
  compact?: boolean;
};

export function EmptyState({ message, action, compact }: EmptyStateProps) {
  return (
    <div className={`${compact ? 'p-3' : 'p-4'} flex items-center gap-2 text-body text-fg-subtle`}>
      <span className="min-w-0">{message}</span>
      {action}
    </div>
  );
}
