"use client";

import { useState, useCallback } from "react";
import type { LibraryFilters } from "@workspace/library/types";

export function useLibraryFilters() {
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const setFilter = useCallback(<K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  return { filters, setFilter, clearFilters, page, setPage, pageSize };
}
