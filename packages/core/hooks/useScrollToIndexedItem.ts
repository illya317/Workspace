"use client";

import { useCallback, useEffect, useRef, type RefCallback } from "react";

const defaultFocusSelector = [
  "input:not([disabled])",
  "textarea:not([disabled])",
].join(",");

const defaultFallbackFocusSelector = [
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface UseScrollToIndexedItemOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  focusSelector?: string;
  fallbackFocusSelector?: string;
}

export interface UseScrollToIndexedItemResult<TElement extends HTMLElement = HTMLElement> {
  getItemRef: (index: number) => RefCallback<TElement>;
  requestScrollToIndex: (index: number) => void;
}

export function useScrollToIndexedItem<TElement extends HTMLElement = HTMLElement>(
  itemCount: number,
  {
    behavior = "smooth",
    block = "center",
    focusSelector = defaultFocusSelector,
    fallbackFocusSelector = defaultFallbackFocusSelector,
  }: UseScrollToIndexedItemOptions = {},
): UseScrollToIndexedItemResult<TElement> {
  const pendingIndexRef = useRef<number | null>(null);
  const itemRefs = useRef(new Map<number, TElement>());

  const requestScrollToIndex = useCallback((index: number) => {
    pendingIndexRef.current = index;
  }, []);

  const getItemRef = useCallback((index: number): RefCallback<TElement> => {
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
      node.scrollIntoView({ behavior, block });
      const focusTarget =
        node.querySelector<HTMLElement>(focusSelector) ??
        node.querySelector<HTMLElement>(fallbackFocusSelector);
      focusTarget?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [behavior, block, fallbackFocusSelector, focusSelector, itemCount]);

  return { getItemRef, requestScrollToIndex };
}
