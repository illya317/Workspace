"use client";

import { workspacePath } from "@workspace/core/routing";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useCallback, useEffect, useRef, useState } from "react";

export function useConsolidationOverview(autoCreate = false) {
  const [data, setData] = useState<ConsolidationOverview | null>(null);
  const [parentCompanyId, setParentCompanyId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const autoCreateAttempts = useRef(new Set<string>());

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
    const overviewPath = `/api/modules/finance/statements/consolidation${params.size > 0 ? `?${params}` : ""}`;
    const load = async () => {
      let attemptedCreateKey: string | null = null;
      try {
        const response = await fetch(workspacePath(overviewPath), { signal: controller.signal });
        const payload = await response.json().catch(() => null) as (ConsolidationOverview & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error || "合并底稿概览加载失败");
        if (!payload) throw new Error("合并底稿概览返回了空响应，请刷新后重试");
        let resolved = payload as ConsolidationOverview;
        const createKey = `${resolved.scope.parentCompanyId}:${resolved.scope.year}:${resolved.scope.month}`;
        if (autoCreate && !resolved.batch && resolved.scope.parentCompanyId && !autoCreateAttempts.current.has(createKey)) {
          autoCreateAttempts.current.add(createKey);
          attemptedCreateKey = createKey;
          const createResponse = await fetch(workspacePath("/api/modules/finance/statements/consolidation/batches"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentCompanyId: resolved.scope.parentCompanyId,
              year: resolved.scope.year,
              month: resolved.scope.month,
            }),
            signal: controller.signal,
          });
          const createPayload = await createResponse.json().catch(() => null) as { error?: string } | null;
          if (!createResponse.ok) throw new Error(createPayload?.error || "合并报表生成失败");
          const refreshed = await fetch(workspacePath(
            `/api/modules/finance/statements/consolidation?parentCompanyId=${resolved.scope.parentCompanyId}&year=${resolved.scope.year}&month=${resolved.scope.month}`,
          ), { signal: controller.signal });
          const refreshedPayload = await refreshed.json().catch(() => null) as (ConsolidationOverview & { error?: string }) | null;
          if (!refreshed.ok || !refreshedPayload) throw new Error(refreshedPayload?.error || "合并报表生成后刷新失败");
          resolved = refreshedPayload;
        }
        setData(resolved);
        setParentCompanyId(resolved.scope.parentCompanyId);
        setYear(resolved.scope.year);
        setMonth(resolved.scope.month);
      } catch (cause: unknown) {
        if (attemptedCreateKey) autoCreateAttempts.current.delete(attemptedCreateKey);
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "合并底稿概览加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [autoCreate, month, parentCompanyId, refreshKey, year]);

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
