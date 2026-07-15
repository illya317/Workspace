"use client";

import { workspacePath } from "@workspace/core/routing";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useCallback, useEffect, useState } from "react";

export function useConsolidationOverview() {
  const [data, setData] = useState<ConsolidationOverview | null>(null);
  const [parentCompanyId, setParentCompanyId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (year !== null && month !== null) {
      params.set("year", String(year));
      params.set("month", String(month));
    }
    if (parentCompanyId !== null) params.set("parentCompanyId", String(parentCompanyId));
    setLoading(true);
    setError(null);
    fetch(workspacePath(`/api/modules/finance/statements/consolidation${params.size > 0 ? `?${params}` : ""}`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as (ConsolidationOverview & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error || "合并底稿概览加载失败");
        if (!payload) throw new Error("合并底稿概览返回了空响应，请刷新后重试");
        return payload as ConsolidationOverview;
      })
      .then((payload) => {
        setData(payload);
        setParentCompanyId(payload.scope.parentCompanyId);
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
  }, [month, parentCompanyId, refreshKey, year]);

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
    refresh: () => setRefreshKey((current) => current + 1),
  };
}
