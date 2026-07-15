"use client";

import { workspacePath } from "@workspace/core/routing";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useCallback, useEffect, useState } from "react";

export function useConsolidationOverview() {
  const [data, setData] = useState<ConsolidationOverview | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (year !== null && month !== null) {
      params.set("year", String(year));
      params.set("month", String(month));
    }
    setLoading(true);
    setError(null);
    fetch(workspacePath(`/api/modules/finance/statements/consolidation${params.size > 0 ? `?${params}` : ""}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "合并底稿概览加载失败");
        return payload as ConsolidationOverview;
      })
      .then((payload) => {
        setData(payload);
        setYear(payload.scope.year);
        setMonth(payload.scope.month);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "合并底稿概览加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, year]);

  const selectYear = useCallback((nextYear: number) => {
    const nextMonth = data?.scope.availablePeriods.find((period) => period.year === nextYear)?.month ?? 12;
    setYear(nextYear);
    setMonth(nextMonth);
  }, [data]);

  return {
    data,
    error,
    loading,
    year,
    month,
    setYear: selectYear,
    setMonth,
  };
}
