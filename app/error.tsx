'use client';
// [TBO-58 P2 2026-07-24] 라우트 에러 경계 — 종전엔 렌더 오류가 **무기록**으로 백지화됐다(검증④
//  치명 갭 ③). 콘솔 1줄([fe] route-error digest=…)로 남기고 사용자에겐 복구 버튼을 준다.
//  PII·스택 원문은 화면·전송 어디에도 싣지 않는다(digest는 Next가 만든 무의미 해시).
import { useEffect } from 'react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[fe] route-error digest=${error.digest ?? '-'} message=${error.message}`);
  }, [error]);
  return (
    <div className="p-10 max-w-[560px] mx-auto text-center space-y-4">
      <h1 className="text-title font-bold">화면을 그리는 중 문제가 생겼습니다</h1>
      <p className="text-body text-fg-muted">
        일시적인 오류일 수 있습니다. 아래 버튼으로 다시 시도하고, 반복되면 대표에게 오류 코드
        <span className="mono"> {error.digest ?? '없음'} </span>를 알려주세요.
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>다시 시도</button>
        <button type="button" className="btn" onClick={() => window.location.assign('/')}>홈으로</button>
      </div>
    </div>
  );
}
