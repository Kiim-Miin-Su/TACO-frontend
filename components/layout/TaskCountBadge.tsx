type TaskCountBadgeProps = {
  count?: number;
  className?: string;
  dot?: boolean;
};

/** 미해결 업무 숫자 표현의 공통 컴포넌트. 숫자는 projectTaskBadges 결과만 props로 받는다. */
export default function TaskCountBadge({ count = 0, className = '', dot = false }: TaskCountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={`grid place-items-center rounded-full bg-danger font-bold leading-none text-white ${
        dot ? 'h-2 w-2 min-w-2' : 'h-4 min-w-4 px-1 text-[10px]'
      } ${className}`}
      title={`${count}건`}
      aria-label={`${count}건`}
    >
      {!dot && (count > 99 ? '99+' : count)}
    </span>
  );
}
