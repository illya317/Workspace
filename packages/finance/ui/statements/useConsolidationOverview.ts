"use client";

import { workspacePath } from "@workspace/core/routing";
import type { ConsolidationOverview } from "@workspace/finance/types";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  consolidationOverviewMatchesSelection,
  consolidationPeriodSelectionRequiresReload,
} from "./consolidation-overview-request";

type EnsureBatchResponse = {
  batch?: NonNullable<ConsolidationOverview["batch"]>;
  created?: boolean;
  error?: string;
};

export function useConsolidationOverview(
  periodKind: StatementPeriodKind,
  canUpdate: boolean,
  includeComparisons = false,
) {
  const [data, setData] = useState<ConsolidationOverview | null>(null);
  const [parentCompanyId, setParentCompanyId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const resolvedSelectionKeyRef = useRef<string | null>(null);
  const refreshedSnapshotKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const selectionKey = [parentCompanyId, year, month, periodKind, selectedBatchId, includeComparisons, refreshKey].join(":");
    if (resolvedSelectionKeyRef.current === selectionKey) return;
    const controller = new AbortController();
    let cancelled = false;
    const params = new URLSearchParams();
    if (year !== null && month !== null) {
      params.set("year", String(year));
      params.set("month", String(month));
    }
    if (parentCompanyId !== null) params.set("parentCompanyId", String(parentCompanyId));
    if (selectedBatchId !== null) params.set("batchId", String(selectedBatchId));
    params.set("periodKind", periodKind);
    if (includeComparisons) params.set("includeComparisons", "true");
    setLoading(true);
    setError(null);
    setData(null);
    const requestedSelection = { parentCompanyId, year, month, periodKind, batchId: selectedBatchId };
    const overviewPath = `/api/modules/finance/statements/consolidation${params.size > 0 ? `?${params}` : ""}`;
    const load = async () => {
      try {
        const response = await fetch(workspacePath(overviewPath), { signal: controller.signal });
        const payload = await response.json().catch(() => null) as (ConsolidationOverview & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error || "合并底稿概览加载失败");
        if (!payload) throw new Error("合并底稿概览返回了空响应，请刷新后重试");
        if (cancelled || controller.signal.aborted) return;
        if (!consolidationOverviewMatchesSelection(payload, requestedSelection)) {
          throw new Error("合并底稿响应范围与当前选择不一致，请刷新后重试");
        }
        const snapshotKey = payload.batch
          ? `${payload.batch.id}:${payload.batch.sourceFingerprint}`
          : null;
        if (canUpdate
          && payload.batch?.status === "draft"
          && refreshedSnapshotKeyRef.current !== snapshotKey) {
          const snapshotResponse = await fetch(workspacePath(
            `/api/modules/finance/statements/consolidation/batches/${payload.batch.id}/sources`,
          ), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedRevision: payload.batch.revision, intent: "refresh" }),
            signal: controller.signal,
          });
          const snapshotPayload = await snapshotResponse.json().catch(() => null) as {
            batch?: NonNullable<ConsolidationOverview["batch"]>;
            changed?: boolean;
            error?: string;
          } | null;
          if (snapshotResponse.status === 409) {
            if (!cancelled && !controller.signal.aborted) setRefreshKey((current) => current + 1);
            return;
          }
          if (!snapshotResponse.ok) throw new Error(snapshotPayload?.error || "个别报表快照自动保存失败");
          if (snapshotPayload?.changed) {
            const refreshedBatch = snapshotPayload.batch;
            refreshedSnapshotKeyRef.current = refreshedBatch
              ? `${refreshedBatch.id}:${refreshedBatch.sourceFingerprint}`
              : null;
            if (!cancelled && !controller.signal.aborted) setRefreshKey((current) => current + 1);
            return;
          }
          refreshedSnapshotKeyRef.current = snapshotKey;
        }
        resolvedSelectionKeyRef.current = [
          payload.scope.parentCompanyId,
          payload.scope.year,
          payload.scope.month,
          periodKind,
          selectedBatchId,
          includeComparisons,
          refreshKey,
        ].join(":");
        setData(payload);
        setParentCompanyId(payload.scope.parentCompanyId);
        setYear(payload.scope.year);
        setMonth(payload.scope.month);
      } catch (cause: unknown) {
        if (cancelled || cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "合并底稿概览加载失败");
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canUpdate, includeComparisons, month, parentCompanyId, periodKind, refreshKey, selectedBatchId, year]);

  const invalidate = useCallback(() => {
    resolvedSelectionKeyRef.current = null;
    setData(null);
    setError(null);
    setLoading(true);
    setRefreshKey((current) => current + 1);
  }, []);

  const selectPeriod = useCallback((nextYear: number, nextMonth: number) => {
    if (!consolidationPeriodSelectionRequiresReload(
      { year, month, batchId: selectedBatchId },
      { year: nextYear, month: nextMonth },
    )) return;
    invalidate();
    setSelectedBatchId(null);
    setYear(nextYear);
    setMonth(nextMonth);
  }, [invalidate, month, selectedBatchId, year]);

  const selectYear = useCallback((nextYear: number) => {
    const nextMonth = data?.scope.availablePeriods.find((period) => period.year === nextYear)?.month ?? 12;
    selectPeriod(nextYear, nextMonth);
  }, [data, selectPeriod]);

  const selectMonth = useCallback((nextMonth: number) => {
    invalidate();
    setSelectedBatchId(null);
    setMonth(nextMonth);
  }, [invalidate]);

  const selectBatch = useCallback((batchId: number | null) => {
    invalidate();
    setSelectedBatchId(batchId);
  }, [invalidate]);

  const createNextVersion = useCallback(async (baseBatchId: number) => {
    if (parentCompanyId === null || year === null || month === null) {
      throw new Error("当前合并范围或期间尚未就绪");
    }
    setCreatingVersion(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/statements/consolidation/batches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentCompanyId, year, month, periodKind, baseBatchId }),
      });
      const payload = await response.json().catch(() => null) as EnsureBatchResponse | null;
      if (!response.ok) throw new Error(payload?.error || "新版本创建失败");
      if (!payload?.batch) throw new Error("新版本创建成功，但服务器未返回批次");
      refreshedSnapshotKeyRef.current = `${payload.batch.id}:${payload.batch.sourceFingerprint}`;
      invalidate();
      setSelectedBatchId(payload.batch.id);
      return { batch: payload.batch, created: payload.created === true };
    } finally {
      setCreatingVersion(false);
    }
  }, [invalidate, month, parentCompanyId, periodKind, year]);
  const refresh = useCallback((freshBatch?: NonNullable<ConsolidationOverview["batch"]>) => {
    if (freshBatch) {
      refreshedSnapshotKeyRef.current = `${freshBatch.id}:${freshBatch.sourceFingerprint}`;
    }
    invalidate();
  }, [invalidate]);
  const refreshSnapshots = useCallback(() => {
    refreshedSnapshotKeyRef.current = null;
    refresh();
  }, [refresh]);
  const clearBatchAndRefresh = useCallback(() => {
    refreshedSnapshotKeyRef.current = null;
    invalidate();
    setSelectedBatchId(null);
  }, [invalidate]);

  return {
    data,
    error,
    loading,
    year,
    month,
    selectedBatchId,
    creatingVersion,
    setYear: selectYear,
    setMonth: selectMonth,
    setPeriod: selectPeriod,
    setBatchId: selectBatch,
    createNextVersion,
    refresh,
    refreshSnapshots,
    invalidate,
    clearBatchAndRefresh,
  };
}
