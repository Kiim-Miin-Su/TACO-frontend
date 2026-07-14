"use client";

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useAutoClear<T>(
  value: T,
  setValue: Dispatch<SetStateAction<T>>,
  emptyValue: T,
  delayMs: number,
): void {
  useEffect(() => {
    if (!value) return;
    const timeout = window.setTimeout(() => setValue(emptyValue), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, emptyValue, setValue, value]);
}

export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>, initial: number): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function useWindowKeydown(handler: (event: KeyboardEvent) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
