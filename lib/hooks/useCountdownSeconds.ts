"use client";

// [TBO-31 C2 2026-07-16] OTP 카운트다운 공용 훅 — ProfileChangeModal의 로컬 구현을 lib/hooks로
//  추출(대표 재사용 규약 — 가입 폼 EmailOtpField와 마이 페이지 인증 stepper가 같은 구현을 쓴다).
import { useEffect, useState } from "react";

/** 1초 간격 카운트다운(초) — 대상 시각이 지나면 0에서 정지. 만료·재전송 cooldown 표시 공용. */
export function useCountdownSeconds(targetIso: string | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) {
      setRemaining(0);
      return;
    }
    const compute = () => Math.max(0, Math.ceil((Date.parse(targetIso) - Date.now()) / 1000));
    setRemaining(compute());
    const timer = window.setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);
  return remaining;
}

/** m:ss 표기(만료 카운트다운 표시용) — 카운트다운 훅과 함께 쓰는 포맷 단일 소스. */
export const formatClock = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
