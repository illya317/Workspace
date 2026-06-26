"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolbarLayoutMode } from "./Toolbar.types";

const DEFAULT_GAP_PX = 12;

function sameKeys(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

export function useAutoToolbarLayout({
  enabled,
  containerRef,
  compactMeasureRef,
}: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  compactMeasureRef: React.RefObject<HTMLElement | null>;
}) {
  const [mode, setMode] = useState<Exclude<ToolbarLayoutMode, "auto">>("compact");

  useEffect(() => {
    if (!enabled) {
      setMode("compact");
      return;
    }

    const check = () => {
      const container = containerRef.current;
      const compact = compactMeasureRef.current;
      if (!container || !compact) return;
      setMode(compact.scrollWidth <= container.clientWidth ? "compact" : "split");
    };

    const rafId = requestAnimationFrame(check);
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    if (compactMeasureRef.current) observer.observe(compactMeasureRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [compactMeasureRef, containerRef, enabled]);

  return mode;
}

export function useHiddenToolbarItems(itemKeys: string[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(itemKeys));

  useEffect(() => {
    const check = () => {
      const container = containerRef.current;
      if (!container) return;

      const availableWidth = container.clientWidth;
      let usedWidth = 0;
      const nextVisible = new Set<string>();

      for (const key of itemKeys) {
        const item = itemRefs.current.get(key);
        if (!item) continue;
        const nextWidth = item.offsetWidth + (nextVisible.size > 0 ? DEFAULT_GAP_PX : 0);
        if (usedWidth + nextWidth <= availableWidth) {
          nextVisible.add(key);
          usedWidth += nextWidth;
        } else {
          break;
        }
      }

      setVisibleKeys((current) => sameKeys(current, nextVisible) ? current : nextVisible);
    };

    const rafId = requestAnimationFrame(check);
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    for (const item of itemRefs.current.values()) observer.observe(item);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [itemKeys]);

  return { containerRef, itemRefs, visibleKeys };
}
