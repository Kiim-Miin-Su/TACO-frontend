// [E0.6 H2 2026-07-15] LoadingState — 목록 초기 로드 단일 규격.
//  종전엔 목록 뷰들이 `data = []` 기본값만 쓰고 isPending을 무시해, 로드 중에 "…없습니다"
//  빈 상태가 먼저 깜빡였다(데이터 유실로 오인 — UX 감사 H2). 규칙: EmptyState는 로드 완료 후에만,
//  로드 중에는 이 컴포넌트. (skeleton 고도화는 E2에서 — 이 컴포넌트를 그대로 확장한다.)
type LoadingStateProps = {
  message?: string;
  /** compact: 목록 셀 안 등 좁은 곳(p-3) / 기본 p-4 */
  compact?: boolean;
};

export function LoadingState({ message = "불러오는 중...", compact }: LoadingStateProps) {
  return (
    <div className={`${compact ? "p-3" : "p-4"} text-body text-fg-muted`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
