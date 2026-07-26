"use client";

import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import type {
  CostOperationalAnalysisDefinition,
  CostOperationalAnalysisRuntimeDTO,
  OperationalAnalysisScopeType,
} from "@workspace/finance/types";

export type CostAnalysisRuntimeFilters = {
  year?: number;
  month?: number;
  product: string;
};

export function useCostOperationalAnalysisRuntime({
  scopeType,
  scopeId,
  templateId,
  definition,
}: {
  scopeType: OperationalAnalysisScopeType;
  scopeId: number;
  templateId: number | null;
  definition: CostOperationalAnalysisDefinition | null;
}) {
  const [filters, setFilters] = useState<CostAnalysisRuntimeFilters>(() => defaults(definition));
  const [data, setData] = useState<CostOperationalAnalysisRuntimeDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilters(defaults(definition));
  }, [definition, templateId]);

  const load = useCallback(async () => {
    if (!templateId || !definition) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (filters.year) query.set("year", String(filters.year));
      if (filters.month) query.set("month", String(filters.month));
      if (filters.product.trim()) query.set("productName", filters.product.trim());
      const response = await fetch(workspacePath(
        `/api/modules/finance/cost/operational-analytics/spaces/${scopeType}/${scopeId}/templates/${templateId}/runtime?${query}`,
      ));
      const body = await response.json() as { success?: boolean; data?: CostOperationalAnalysisRuntimeDTO; error?: string };
      if (!response.ok || !body.success || !body.data) throw new Error(body.error || "成本分析加载失败");
      setData(body.data);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "成本分析加载失败");
    } finally {
      setLoading(false);
    }
  }, [definition, filters.month, filters.product, filters.year, scopeId, scopeType, templateId]);

  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, filters, setFilters, refetch: load };
}

function defaults(definition: CostOperationalAnalysisDefinition | null): CostAnalysisRuntimeFilters {
  return {
    year: definition?.defaults?.year ?? new Date().getFullYear(),
    month: definition?.defaults?.month,
    product: definition?.defaults?.product ?? "",
  };
}
