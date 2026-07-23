'use client';
// [TBO-32 C4 2026-07-22 D1] 미정산 감지 배너 — "적격 세션이 있는데 정산서 미연결"인 (강사×월)을
//  정산 탭 상단에 상시 노출(월말 누락 방지 센서). 재사용: 중앙 훅(useUncoveredPayouts)·
//  won(lib/format)·payout-shared. 분리 컴포넌트 — 대시보드 등 다른 화면에서도 그대로 쓸 수 있다.
import { useState } from 'react';
import { Badge } from '@/components/ui';
import { useUncoveredPayouts } from '@/lib/queries';
import { won } from '@/lib/format';

export function UncoveredBanner({ onBulkGenerate }: { onBulkGenerate?: () => void }) {
  const { data: entries = [], isLoading } = useUncoveredPayouts(3);
  const [open, setOpen] = useState(false);
  if (isLoading || entries.length === 0) return null;
  const total = entries.reduce((acc, e) => acc + e.computedAmount, 0);

  return (
    <div className="card card-pad border-attention/40 bg-attention/5 space-y-2" role="status">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="attention">미정산 감지</Badge>
        <span className="text-body">
          최근 3개월에 <b>{entries.length}건</b>(강사×월)의 미정산 적격 시수가 있습니다 — 합계 <b className="mono">{won(total)}</b>
        </span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '자세히'}</button>
          {onBulkGenerate && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onBulkGenerate}>일괄 산정</button>
          )}
        </span>
      </div>
      {open && (
        <ul className="space-y-1 text-body">
          {entries.map((e) => (
            <li key={`${e.instructorId}-${e.month}`} className="flex items-center gap-2">
              <span className="mono text-fg-subtle">{e.month}</span>
              <span className="font-medium">{e.instructorName}</span>
              {e.instructorStatus !== 'active' && <Badge tone="danger">비활성</Badge>}
              <span className="text-fg-muted">{e.sessionCount}회</span>
              <span className="mono ml-auto">{won(e.computedAmount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
