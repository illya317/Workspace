"use client";

import { useCallback, useEffect, useRef, type RefCallback } from "react";

const inputSelector = [
  "input:not([disabled])",
  "textarea:not([disabled])",
].join(",");

const fallbackFocusableSelector = [
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useScrollToAddedItem(items: readonly unknown[]) {
  const pendingIndexRef = useRef<number | null>(null);
  const itemRefs = useRef(new Map<number, HTMLElement>());

  const requestScrollToIndex = useCallback((index: number) => {
    pendingIndexRef.current = index;
  }, []);

  const getItemRef = useCallback((index: number): RefCallback<HTMLElement> => {
    return (node) => {
      if (node) itemRefs.current.set(index, node);
      else itemRefs.current.delete(index);
    };
  }, []);

  useEffect(() => {
    const index = pendingIndexRef.current;
    if (index === null) return;
    pendingIndexRef.current = null;

    const node = itemRefs.current.get(index);
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusTarget =
        node.querySelector<HTMLElement>(inputSelector) ??
        node.querySelector<HTMLElement>(fallbackFocusableSelector);
      focusTarget?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [items.length]);

  return { getItemRef, requestScrollToIndex };
}
