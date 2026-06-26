import { type Tone, dotColor } from './tokens';

export function StatusDot({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="dot" style={{ backgroundColor: dotColor[tone] }} />
      <span>{label}</span>
    </span>
  );
}
