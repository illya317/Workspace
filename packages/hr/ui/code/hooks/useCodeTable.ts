"use client";

import { useState } from "react";
import {
  toggleSort as getNextSortState,
  getSortedCodes,
} from "../../code-helpers";
import type { CodeItem } from "@workspace/hr/types";

export function useCodeTable(codes: CodeItem[], stats: Record<string, number>) {
  const [sortField, setSortField] = useState<"code" | "name" | "count">("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  function toggleSort(field: "code" | "name" | "count") {
    const next = getNextSortState(sortField, sortDirection, field);
    setSortField(next.sortField);
    setSortDirection(next.sortDirection);
  }

  const sortedCodes = getSortedCodes(codes, stats, sortField, sortDirection);

  return { sortField, sortDirection, toggleSort, sortedCodes };
}
