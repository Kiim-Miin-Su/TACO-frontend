"use client";
// [C-2 2026-07-06] localStorage 복원 상태 훅 — 뷰 새로고침에도 사용자의 뷰/필터 선택 유지.
//  SSR 안전: 서버·첫 클라 렌더는 항상 initial(하이드레이션 불일치 없음) → mount effect에서 LS 값으로 복원.
//  초기 로드 전에는 쓰기를 막아(loaded ref) 기본값이 저장값을 덮어쓰지 않게 한다.
//  실제 storage 접근은 lib/storage/preferences의 typed wrapper만 사용한다.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { jsonPreferenceCodec, readPreference, writePreference, type PreferenceCodec, type ReadOptions } from "@/lib/storage/preferences";

export function usePersistedState<T>(
  key: string,
  initial: T,
  codec: PreferenceCodec<T> = jsonPreferenceCodec<T>(),
  options: ReadOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  const codecRef = useRef(codec);
  codecRef.current = codec;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 복원: mount 시 1회. 실패(파싱 오류·미지원)면 조용히 기본값 유지.
  useEffect(() => {
    setValue(readPreference(key, initial, codecRef.current, optionsRef.current));
    loaded.current = true;
    // key 변경 시 재복원(동일 컴포넌트에서 키를 바꾸는 경우 대비)
  }, [key, initial]);

  // 저장: 값 변경 시. 단, 최초 복원 전에는 쓰지 않음(기본값이 저장값을 덮는 것 방지).
  useEffect(() => {
    if (!loaded.current) return;
    writePreference(key, value, codecRef.current);
  }, [key, value]);

  return [value, setValue];
}

// Set<number|string> 직렬화 코덱 — 캘린더 리소스/상태 필터 등 Set 상태 영속용(후속 확장).
export const setCodec = <T extends number | string>(): PreferenceCodec<Set<T>> => ({
  serialize: (v) => JSON.stringify([...v]),
  deserialize: (s) => new Set(JSON.parse(s) as T[]),
});
