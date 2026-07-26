"use client";

import { useEffect, useRef } from "react";

export function useCreatePanelAutoScroll<T extends HTMLElement>(active = true, trigger: unknown = active) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active || trigger == null || !ref.current) return;
    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, trigger]);

  return ref;
}
