'use client';
// [TBO-58 P2 2026-07-24] 루트 레이아웃까지 죽는 최후 경계 — html/body를 직접 감싼다(Next 규약).
//  스타일 시트가 이미 죽었을 수 있어 인라인 스타일만 사용한다.
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[fe] global-error digest=${error.digest ?? '-'} message=${error.message}`);
  }, [error]);
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>앱에 문제가 생겼습니다</h1>
        <p style={{ color: '#666', margin: '12px 0 20px' }}>
          새로고침으로 대부분 복구됩니다. 반복되면 오류 코드 {error.digest ?? '없음'} 를 대표에게 알려주세요.
        </p>
        <button type="button" onClick={reset} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}>
          다시 시도
        </button>
      </body>
    </html>
  );
}
