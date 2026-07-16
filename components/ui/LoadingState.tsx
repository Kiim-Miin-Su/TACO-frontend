// [E0.6 H2 2026-07-15] LoadingState — 목록 초기 로드 단일 규격.
//  종전엔 목록 뷰들이 `data = []` 기본값만 쓰고 isPending을 무시해, 로드 중에 "…없습니다"
//  빈 상태가 먼저 깜빡였다(데이터 유실로 오인 — UX 감사 H2). 규칙: EmptyState는 로드 완료 후에만,
//  로드 중에는 이 컴포넌트.
// [B6 C3 2026-07-16] skeleton 승격(E2) — 문구 대신 animate-pulse 바(rows줄, 너비 3종 순환)를
//  기본 렌더로. message는 sr-only로 스크린리더에 계속 전달(role="status" aria-live 유지).
//  시그니처 하위호환: 기존 사용처는 props 그대로 자동 skeleton화.
type LoadingStateProps = {
  message?: string;
  /** compact: 목록 셀 안 등 좁은 곳(p-3) / 기본 p-4 */
  compact?: boolean;
  /** skeleton 바 줄 수(기본 3) */
  rows?: number;
};

// 너비 3종 순환 — 균일 바보다 목록 텍스트처럼 자연스럽게.
const BAR_WIDTHS = ["w-3/5", "w-4/5", "w-2/5"] as const;

export function LoadingState({ message = "불러오는 중...", compact, rows = 3 }: LoadingStateProps) {
  return (
    <div className={compact ? "p-3" : "p-4"} role="status" aria-live="polite">
      <span className="sr-only">{message}</span>
      {/* 팔레트: bg-line-muted(--color-line-muted) — 진도바 등 기존 사용 유틸과 동일 톤 */}
      <div className="animate-pulse space-y-2" aria-hidden="true">
        {Array.from({ length: Math.max(1, rows) }, (_, i) => (
          <div key={i} className={`h-3 rounded bg-line-muted ${BAR_WIDTHS[i % BAR_WIDTHS.length]}`} />
        ))}
      </div>
    </div>
  );
}
