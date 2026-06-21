"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { DirectoryNode } from "@workspace/library/types";

const INITIAL_DIRECTORIES: DirectoryNode[] = [];

export function useLibraryDirectories() {
  const loadDirectories = useCallback(async () => {
    const response = await fetch(workspacePath("/api/modules/library/basic-info/directories"));
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json() as Promise<DirectoryNode[]>;
  }, []);

  const { data: directories, loading, error, refresh } = useAsyncResource(loadDirectories, {
    initialData: INITIAL_DIRECTORIES,
    resetOnError: true,
    errorMessage: "加载目录失败",
  });

  return { directories, loading, error, refresh };
}
