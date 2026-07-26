"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import type { FinanceShipmentAnalyticsResponse } from "@workspace/finance/types";
import type { CostFiltersState, PaginatedResponse, ShipmentQueryScope, ShipmentWorkspaceState } from "../types";
import { shipmentDateRange, shipmentTrendGrain } from "../components/CostFilters";

interface UseCostDataOptions {
  endpoint: string;
  filters: CostFiltersState;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export function useCostData<T = Record<string, unknown>>({
  endpoint,
  filters,
  page = 1,
  pageSize = 50,
  enabled = true,
}: UseCostDataOptions) {
  const [data, setData] = useState<T[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.year !== undefined) params.set("year", String(filters.year));
      if (filters.month !== undefined) params.set("month", String(filters.month));
      if (filters.productName) params.set("productName", filters.productName);
      if (filters.customerName) params.set("customerName", filters.customerName);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(workspacePath(`/api/modules/finance/cost/${endpoint}?${params.toString()}`));
      const json = (await res.json()) as PaginatedResponse<T>;

      if (!res.ok || !json.success) {
        throw new Error((json as unknown as Record<string, string>).error || "请求失败");
      }

      setData(json.data ?? []);
      setPagination(json.pagination ?? { page: 1, pageSize: 50, total: 0, totalPages: 0 });
      setSummary((json.summary as Record<string, unknown>) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [endpoint, filters, page, pageSize, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, summary, pagination, loading, error, refetch: fetchData };
}

export function useShipmentData(view: ShipmentWorkspaceState, page: number, scope?: ShipmentQueryScope, enabled = true) {
  const { dateFrom, dateTo } = shipmentDateRange(view);
  const { detailSortBy, detailSortOrder, pageSize } = view;
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<never>["pagination"]>({
    page: 1,
    pageSize: view.pageSize,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchShipments = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = shipmentParams(dateFrom, dateTo, scope);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", detailSortBy);
      params.set("sortOrder", detailSortOrder);
      const res = await fetch(workspacePath(`${shipmentApiPath(scope)}?${params.toString()}`));
      const json = await res.json() as PaginatedResponse<Record<string, unknown>> & { error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "发货明细加载失败");
      setData(json.data ?? []);
      setPagination(json.pagination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, detailSortBy, detailSortOrder, enabled, page, pageSize, scope]);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);
  return { data, pagination, loading, error, refetch: fetchShipments };
}

export function useShipmentAnalytics(view: ShipmentWorkspaceState, scope?: ShipmentQueryScope, enabled = true) {
  const { dateFrom, dateTo } = shipmentDateRange(view);
  const { groupBy, sortBy, sortOrder } = view;
  const grain = shipmentTrendGrain(view);
  const [data, setData] = useState<FinanceShipmentAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchAnalysis = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    try {
      const params = shipmentParams(dateFrom, dateTo, scope);
      params.set("grain", grain);
      params.set("groupBy", groupBy);
      params.set("comparison", "previousYear");
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const res = await fetch(workspacePath(`${shipmentApiPath(scope)}/analytics?${params.toString()}`));
      const json = await res.json() as {
        success: boolean;
        data?: FinanceShipmentAnalyticsResponse;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "请求失败");
      }
      setData(json.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, enabled, grain, groupBy, scope, sortBy, sortOrder]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return { data, loading, error, refetch: fetchAnalysis };
}

function shipmentParams(dateFrom: string | null, dateTo: string | null, scope?: ShipmentQueryScope) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (scope && "departmentId" in scope) params.set("departmentId", String(scope.departmentId));
  if (scope && "scopeType" in scope) {
    params.set("scopeType", scope.scopeType);
    params.set("scopeId", String(scope.scopeId));
  }
  return params;
}

function shipmentApiPath(scope?: ShipmentQueryScope) {
  return scope && "scopeType" in scope
    ? "/api/modules/finance/cost/operational-analytics/shipments"
    : "/api/modules/finance/cost/shipments";
}
