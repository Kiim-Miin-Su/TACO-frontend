import type { ReactNode } from 'react';

/**
 * TableWrap — 테이블 오버플로 제로 래퍼 (DESIGN.md §6).
 * 모든 .table은 이 래퍼 안에 둔다. 좁은 화면에서 수평 스크롤로 격리되어
 * 페이지 전체가 밀리는 것을 방지한다.
 * 금지: 래퍼 없는 <table className="table">.
 */
type TableWrapProps = {
  children: ReactNode;
  /** 테이블 최소 폭(px) — 열 붕괴 방지가 필요할 때만 지정 */
  minWidth?: number;
};

export function TableWrap({ children, minWidth }: TableWrapProps) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="표 스크롤 영역">{/* [TBO-34 C4] axe scrollable-region-focusable */}
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}
