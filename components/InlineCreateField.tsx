'use client';

import type { ReactNode } from 'react';
import { Field } from '@/components/ui';

export function InlineCreateField({
  label,
  createLabel,
  expanded,
  onToggle,
  controls,
  children,
  canCreate = true,
}: {
  label: string;
  createLabel: string;
  expanded: boolean;
  onToggle: () => void;
  controls: ReactNode;
  children: ReactNode;
  canCreate?: boolean;
}) {
  return (
    // [TBO-86I-3] 인라인 생성 필드는 컨트롤+버튼(+내부 체크리스트 label) 다중 그룹 — label 클릭
    //  전달 오발동과 중첩 label 무효 마크업을 막기 위해 div 렌더를 쓴다(Field asDiv 주석 참조).
    <Field label={label} asDiv>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex-1 min-w-0">{controls}</div>
          {canCreate && (
            <button
              type="button"
              className={`btn h-9 w-9 shrink-0 p-0 ${expanded ? 'badge-accent' : ''}`}
              aria-label={createLabel}
              title={createLabel}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              ＋
            </button>
          )}
        </div>
        {canCreate && expanded && (
          <div className="border rounded-md bg-canvas-subtle p-3" style={{ borderColor: 'var(--color-line-muted)' }}>
            {children}
          </div>
        )}
      </div>
    </Field>
  );
}
