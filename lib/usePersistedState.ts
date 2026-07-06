"use client";
// [C-2 2026-07-06] localStorage 복원 상태 훅 — 뷰 새로고침에도 사용자의 뷰/필터 선택 유지.
//  SSR 안전: 서버·첫 클라 렌더는 항상 initial(하이드레이션 불일치 없음) → mount effect에서 LS 값으로 복원.
//  초기 로드 전에는 쓰기를 막아(loaded ref) 기본값이 저장값을 덮어쓰지 않게 한다.
//  Set 등 JSON 비직렬화 타입은 serialize/deserialize 주입으로 지원(기본 = JSON).
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type Codec<T> = { serialize: (v: T) => string; deserialize: (s: string) => T };
const jsonCodec = <T,>(): Codec<T> => ({
  serialize: (v) => JSON.stringify(v),
  deserialize: (s) => JSON.parse(s) as T,
});

export function usePersistedState<T>(
  key: string,
  initial: T,
  codec: Codec<T> = jsonCodec<T>(),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  const codecRef = useRef(codec);
  codecRef.current = codec;

  // 복원: mount 시 1회. 실패(파싱 오류·미지원)면 조용히 기본값 유지.
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw != null) setValue(codecRef.current.deserialize(raw));
    } catch {
      /* noop — 손상된 값은 무시 */
    }
    loaded.current = true;
    // key 변경 시 재복원(동일 컴포넌트에서 키를 바꾸는 경우 대비)
  }, [key]);

  // 저장: 값 변경 시. 단, 최초 복원 전에는 쓰지 않음(기본값이 저장값을 덮는 것 방지).
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, codecRef.current.serialize(value));
    } catch {
      /* noop — 저장 실패(용량·프라이빗 모드)는 무시 */
    }
  }, [key, value]);

  return [value, setValue];
}

// Set<number|string> 직렬화 코덱 — 캘린더 리소스/상태 필터 등 Set 상태 영속용(후속 확장).
export const setCodec = <T extends number | string>(): Codec<Set<T>> => ({
  serialize: (v) => JSON.stringify([...v]),
  deserialize: (s) => new Set(JSON.parse(s) as T[]),
});
