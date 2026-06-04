"use client";

import { useState, useEffect } from "react";
import type { CategoryGroup } from "../types";

export function useLibraryCategories() {
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/library/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CategoryGroup[]) => setCategories(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading, error };
}
