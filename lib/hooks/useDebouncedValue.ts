"use client";

// [TBO-31 C2 2026-07-16] 입력 디바운스 공용 훅 — 아이디 가용성 라이브 체크(가입 폼 500ms·
//  프로필 변경 모달 /users/exists)가 같은 구현을 쓴다(화면 복붙 금지 규약).
import { useEffect, useState } from "react";

/** delayMs 동안 입력이 멈춘 뒤의 값을 반환 — 서버 라이브 체크의 요청 폭주 방지. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
