"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import type {
  OperationalAnalysisScopeType,
  WorkspaceAnalysisRuntimeDTO,
} from "@workspace/finance/types";

type RuntimeResponse = {
  success?: boolean;
  data?: WorkspaceAnalysisRuntimeDTO;
  error?: string;
};

type FilterState = {
  identity: string;
  values: Record<string, string>;
};

type RuntimeState = {
  identity: string;
  data: WorkspaceAnalysisRuntimeDTO | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_FILTER_VALUES: Record<string, string> = {};

export function useWorkspaceSourcesOperationalAnalysisRuntime({
  scopeType,
  scopeId,
  templateId,
  revision,
  preview,
  onRevisionConflict,
}: {
  scopeType: OperationalAnalysisScopeType;
  scopeId: number;
  templateId: number | null;
  revision: number | null;
  preview?: { expectedRevision: number } | null;
  onRevisionConflict: () => void | Promise<void>;
}) {
  const identity = `${scopeType}:${scopeId}:${templateId ?? "none"}:${revision ?? "none"}:${preview ? `preview@${preview.expectedRevision}` : "published"}`;
  const enabled = templateId !== null && revision !== null;
  const [filterState, setFilterState] = useState<FilterState>({ identity: "", values: {} });
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    identity: "",
    data: null,
    loading: false,
    error: null,
  });
  const searchFilterKeysRef = useRef<{ identity: string; keys: ReadonlySet<string> }>({
    identity: "",
    keys: new Set(),
  });
  const lastRequestedRef = useRef<{ identity: string; values: Record<string, string> }>({
    identity: "",
    values: {},
  });

  const filterValues = filterState.identity === identity ? filterState.values : EMPTY_FILTER_VALUES;
  const data = runtimeState.identity === identity ? runtimeState.data : null;
  const loading = enabled && (runtimeState.identity !== identity || runtimeState.loading);
  const error = runtimeState.identity === identity ? runtimeState.error : null;

  const setFilterValue = useCallback((key: string, value: string) => {
    setFilterState((current) => {
      const values = current.identity === identity ? current.values : {};
      return { identity, values: { ...values, [key]: value } };
    });
  }, [identity]);

  const filters = useMemo(() => (data?.filters ?? []).map((filter) => ({
    ...filter,
    value: Object.hasOwn(filterValues, filter.key) ? filterValues[filter.key]! : filter.value,
  })), [data?.filters, filterValues]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const previous = lastRequestedRef.current.identity === identity
      ? lastRequestedRef.current.values
      : {};
    const searchKeys = searchFilterKeysRef.current.identity === identity
      ? searchFilterKeysRef.current.keys
      : new Set<string>();
    const changedKeys = new Set([...Object.keys(previous), ...Object.keys(filterValues)]);
    const debounceMs = [...changedKeys].some((key) => (
      previous[key] !== filterValues[key] && searchKeys.has(key)
    )) ? 250 : 0;

    setRuntimeState((current) => ({
      identity,
      data: current.identity === identity ? current.data : null,
      loading: true,
      error: null,
    }));

    const timer = window.setTimeout(() => {
      lastRequestedRef.current = { identity, values: { ...filterValues } };
      const endpoint = preview ? "preview" : "runtime";
      void fetch(workspacePath(
        `/api/modules/finance/cost/operational-analytics/spaces/${scopeType}/${scopeId}/templates/${templateId}/${endpoint}`,
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision,
          filterValues,
          ...(preview ? { expectedRevision: preview.expectedRevision } : {}),
        }),
        signal: controller.signal,
      }).then(async (response) => {
        const body = await response.json() as RuntimeResponse;
        if (response.status === 409) {
          setRuntimeState({
            identity,
            data: null,
            loading: false,
            error: body.error || "分析模板已更新，正在刷新模板列表…",
          });
          await onRevisionConflict();
          return;
        }
        if (!response.ok || !body.success || !body.data) {
          throw new Error(body.error || "经营分析运行失败");
        }
        searchFilterKeysRef.current = {
          identity,
          keys: new Set(body.data.filters.filter((filter) => filter.kind === "search").map((filter) => filter.key)),
        };
        setRuntimeState({ identity, data: body.data, loading: false, error: null });
      }).catch((cause) => {
        if (controller.signal.aborted) return;
        setRuntimeState({
          identity,
          data: null,
          loading: false,
          error: cause instanceof Error ? cause.message : "经营分析运行失败",
        });
      });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, filterValues, identity, onRevisionConflict, preview, revision, scopeId, scopeType, templateId]);

  return { data, filters, setFilterValue, loading, error };
}
