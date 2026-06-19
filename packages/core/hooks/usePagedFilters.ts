"use client";

import { useCallback, useState } from "react";

export function usePagedFilters<TFilters extends object>(
  initialFilters: TFilters,
  pageSize = 50,
) {
  const [filters, setFilters] = useState<TFilters>(initialFilters);
  const [page, setPage] = useState(1);

  const setFilter = useCallback(<K extends keyof TFilters>(
    key: K,
    value: TFilters[K] | undefined | null | "",
  ) => {
    setFilters((previous) => {
      const next = { ...previous };
      if (value === undefined || value === null || value === "") {
        delete next[key];
      } else {
        next[key] = value as TFilters[K];
      }
      return next;
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, [initialFilters]);

  return { filters, setFilter, clearFilters, page, setPage, pageSize };
}
