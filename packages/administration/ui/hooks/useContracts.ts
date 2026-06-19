import { useEffect, useMemo, useState, useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { Contract } from "@workspace/administration/types";

const pageSize = 50;

interface ContractsResource {
  contracts: Contract[];
  total: number;
  locations: string[];
  categories: string[];
  statuses: string[];
}

const EMPTY_CONTRACTS_RESOURCE: ContractsResource = {
  contracts: [],
  total: 0,
  locations: [],
  categories: [],
  statuses: [],
};

export function useContracts() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadContracts = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (q) params.set("q", q);
    if (locationFilter) params.set("location", locationFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/workspace/api/contracts?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      contracts: data.contracts || [],
      total: data.total || 0,
      locations: data.locations || [],
      categories: data.categories || [],
      statuses: data.statuses || [],
    } as ContractsResource;
  }, [q, locationFilter, categoryFilter, statusFilter, page]);

  const { data, refresh } = useAsyncResource(loadContracts, {
    initialData: EMPTY_CONTRACTS_RESOURCE,
    resetOnError: true,
    errorMessage: "加载合同失败",
  });

  useEffect(() => {
    setPage(1);
  }, [q, locationFilter, categoryFilter, statusFilter]);

  const totalPages = useMemo(() => Math.ceil(data.total / pageSize), [data.total]);

  return {
    contracts: data.contracts,
    total: data.total,
    page,
    setPage,
    totalPages,
    q, setQ,
    locationFilter, setLocationFilter,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
    locations: data.locations,
    categories: data.categories,
    statuses: data.statuses,
    refresh,
  };
}
