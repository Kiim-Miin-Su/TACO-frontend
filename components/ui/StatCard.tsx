import type { ReactNode } from 'react';
import { type Tone, dotColor } from './tokens';

type StatCardProps = {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
};

export function StatCard({ label, value, sub, tone = 'neutral', icon }: StatCardProps) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-fg-muted">{label}</span>
        {icon && (
          <span
            className="w-7 h-7 rounded-md grid place-items-center bg-canvas-subtle" style={{ color: dotColor[tone] }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-stat font-semibold mono leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-caption text-fg-muted">{sub}</div>}
    </div>
  );
}
