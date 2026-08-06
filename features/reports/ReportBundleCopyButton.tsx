'use client';

import { useState } from 'react';
import type { SessionReportView } from '@kms545487/contracts';
import { formatSessionReportBundle } from '@/lib/domain/report-bundle';

export function ReportBundleCopyButton({ report }: { report: SessionReportView }) {
  const [message, setMessage] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSessionReportBundle(report));
      setMessage('복사됨');
    } catch {
      setMessage('복사하지 못했습니다');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className={message === '복사됨' ? 'text-caption text-success' : 'text-caption text-danger'} role="status">
          {message}
        </span>
      )}
      <button type="button" className="btn btn-sm" onClick={copy}>
        한 묶음 복사
      </button>
    </div>
  );
}
