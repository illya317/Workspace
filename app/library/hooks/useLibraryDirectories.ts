"use client";

import { useState, useEffect, useCallback } from "react";
import type { DirectoryNode } from "../types";

export function useLibraryDirectories() {
  const [directories, setDirectories] = useState<DirectoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/library/directories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DirectoryNode[]) => setDirectories(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { directories, loading, error, refresh };
}
