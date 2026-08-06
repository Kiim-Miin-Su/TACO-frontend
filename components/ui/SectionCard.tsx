import type { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <div className="card overflow-hidden">
      {/* 제목과 action은 좁은 화면에서 각각 줄을 확보한다. break-keep은 한글 낱글자 붕괴를 막는다. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 min-h-12 py-1.5 border-b">
        <h2 className="min-w-0 max-w-full break-keep text-section font-semibold leading-snug">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
