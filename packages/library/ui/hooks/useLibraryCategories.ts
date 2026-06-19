"use client";

import { useState, useEffect, useCallback } from "react";
import type { CategoryGroup } from "@workspace/library/types";

export function useLibraryCategories() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/workspace/api/library/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CategoryGroup[]) => setCategories(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { categories, loading, error, refresh };
}
