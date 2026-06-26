import type { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 h-12 border-b">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
