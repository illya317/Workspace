"use client";

import { useEffect } from "react";

export type DebouncedEffectCallback = () => void | (() => void);

export function useDebouncedEffect(effect: DebouncedEffectCallback, delayMs: number) {
  useEffect(() => {
    let cleanup: void | (() => void);
    const timer = setTimeout(() => {
      cleanup = effect();
    }, delayMs);

    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [delayMs, effect]);
}
