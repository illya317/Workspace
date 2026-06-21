"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import type { CostFiltersState, PaginatedResponse } from "../types";

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

      const res = await fetch(workspacePath(`/api/finance/cost/${endpoint}?${params.toString()}`));
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

export function useCostSummary(filters: CostFiltersState) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.year !== undefined) params.set("year", String(filters.year));
      if (filters.month !== undefined) params.set("month", String(filters.month));
      if (filters.productName) params.set("productName", filters.productName);
      if (filters.customerName) params.set("customerName", filters.customerName);

      const res = await fetch(workspacePath(`/api/finance/cost/summary?${params.toString()}`));
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "请求失败");
      }

      setData(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}
