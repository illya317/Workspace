"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { CategoryGroup } from "@workspace/library/types";

const INITIAL_CATEGORIES: CategoryGroup[] = [];

export function useLibraryCategories() {
  const loadCategories = useCallback(async () => {
    const response = await fetch(workspacePath("/api/modules/library/categories"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<CategoryGroup[]>;
  }, []);

  const { data: categories, loading, error, refresh } = useAsyncResource(loadCategories, {
    initialData: INITIAL_CATEGORIES,
    resetOnError: true,
    errorMessage: "加载分类失败",
  });

  return { categories, loading, error, refresh };
}
