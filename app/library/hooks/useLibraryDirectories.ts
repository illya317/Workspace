"use client";

import { useState, useEffect, useCallback } from "react";
import type { DirectoryNode } from "../types";

export function useLibraryDirectories() {
  const [directories, setDirectories] = useState<DirectoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/library/directories")
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(text || `HTTP ${r.status}`);
        }
        return r.json() as Promise<DirectoryNode[]>;
      })
      .then((data) => setDirectories(data))
      .catch((e) => {
        setDirectories([]);
        setError(e instanceof Error ? e.message : "加载目录失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { directories, loading, error, refresh };
}
