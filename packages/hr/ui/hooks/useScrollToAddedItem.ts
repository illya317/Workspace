"use client";

import { useScrollToIndexedItem } from "@workspace/core/hooks";

export function useScrollToAddedItem(items: readonly unknown[]) {
  return useScrollToIndexedItem(items.length);
}
