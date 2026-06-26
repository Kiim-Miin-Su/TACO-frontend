'use client';
import { useEffect, useRef } from 'react';
import { Chart as ChartJS, registerables, type ChartConfiguration } from 'chart.js';

ChartJS.register(...registerables);

// chart.js 얇은 래퍼 (React 19 호환 — vanilla chart.js 사용)
export function Chart({ config, height = 240 }: { config: ChartConfiguration; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    instance.current = new ChartJS(ref.current, config);
    return () => instance.current?.destroy();
  }, [config]);

  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}
