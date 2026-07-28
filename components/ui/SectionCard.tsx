import type { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <div className="card overflow-hidden">
      {/* [74A 잔여 2026-07-28] 390px에서 넓은 action(필터 2개 등)이 제목을 낱글자 세로 붕괴시키던 결함 —
          고정 h-12 → min-h + flex-wrap(좁으면 action이 다음 줄), 제목은 nowrap 한 줄 유지(공용 수정 1곳). */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 min-h-12 py-1.5 border-b">
        <h2 className="text-section font-semibold whitespace-nowrap">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
