"use client";

import { usePagedFilters } from "@workspace/core/hooks";
import type { LibraryFilters } from "@workspace/library/types";

const INITIAL_LIBRARY_FILTERS: LibraryFilters = {};

export function useLibraryFilters() {
  return usePagedFilters<LibraryFilters>(INITIAL_LIBRARY_FILTERS, 50);
}
