"use client";

import { useCallback, useEffect, useState } from "react";

export interface UseAsyncResourceOptions<T> {
  initialData: T;
  auto?: boolean;
  resetOnError?: boolean;
  errorMessage?: string;
}

export function useAsyncResource<T>(
  load: () => Promise<T>,
  {
    initialData,
    auto = true,
    resetOnError = false,
    errorMessage = "加载失败",
  }: UseAsyncResourceOptions<T>,
) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await load();
      setData(nextData);
      return nextData;
    } catch (err) {
      if (resetOnError) setData(initialData);
      setError(err instanceof Error ? err.message : errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [errorMessage, initialData, load, resetOnError]);

  useEffect(() => {
    if (auto) void refresh();
  }, [auto, refresh]);

  return { data, setData, loading, error, refresh };
}
