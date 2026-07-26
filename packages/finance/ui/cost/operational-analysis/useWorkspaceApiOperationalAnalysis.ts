"use client";

import { useEffect, useState } from "react";
import type {
  OperationalAnalysisScopeType,
  WorkspaceApiOperationalAnalysisDefinition,
} from "@workspace/finance/types";
import { loadWorkspaceAnalysisSource } from "@workspace/platform/ui/workspace-analysis-source-runtime";

import {
  defaultWorkspaceApiFilterValues,
  type WorkspaceApiFilterValues,
  type WorkspaceApiRow,
} from "./workspace-api-analysis-runtime";

type WorkspaceApiSourceRows = Record<string, WorkspaceApiRow[]>;

export function useWorkspaceApiOperationalAnalysis({
  definition,
  scopeType,
  scopeId,
}: {
  definition: WorkspaceApiOperationalAnalysisDefinition | null;
  scopeType: OperationalAnalysisScopeType;
  scopeId: number;
}) {
  const [sources, setSources] = useState<WorkspaceApiSourceRows>({});
  const [filters, setFilters] = useState<WorkspaceApiFilterValues>(() => (
    definition ? defaultWorkspaceApiFilterValues(definition.filters) : {}
  ));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilters(definition ? defaultWorkspaceApiFilterValues(definition.filters) : {});
  }, [definition]);

  useEffect(() => {
    const controller = new AbortController();
    if (!definition) {
      setSources({});
      setLoading(false);
      setError(null);
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    void Promise.all(definition.sources.map(async (source) => (
      [source.key, await loadWorkspaceAnalysisSource(source, { scopeType, scopeId }, controller.signal)] as const
    ))).then((entries) => {
      if (!controller.signal.aborted) setSources(Object.fromEntries(entries));
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setSources({});
      setError(cause instanceof Error ? cause.message : "经营分析数据源加载失败");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [definition, scopeId, scopeType]);

  return { sources, filters, setFilters, loading, error };
}
