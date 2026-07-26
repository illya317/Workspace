import { workspacePath } from "@workspace/core/routing";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { Contract, ContractCategoryOption, ContractWorkView } from "@workspace/administration/types";

interface ContractsResource {
  contracts: Contract[];
  total: number;
  locations: string[];
  categories: ContractCategoryOption[];
}

const EMPTY_CONTRACTS_RESOURCE: ContractsResource = {
  contracts: [],
  total: 0,
  locations: [],
  categories: [],
};

export function useContracts() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [view, setView] = useState<ContractWorkView>("all");
  const [q, setQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lifecycleStatusFilter, setLifecycleStatusFilter] = useState("");

  const loadContracts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), view });
    if (q) params.set("q", q);
    if (locationFilter) params.set("location", locationFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (lifecycleStatusFilter) params.set("lifecycleStatus", lifecycleStatusFilter);
    const res = await fetch(workspacePath(`/api/modules/administration/contracts?${params.toString()}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      contracts: data.contracts || [],
      total: data.total || 0,
      locations: data.locations || [],
      categories: data.categories || [],
    } as ContractsResource;
  }, [categoryFilter, lifecycleStatusFilter, locationFilter, page, pageSize, q, view]);

  const { data, refresh } = useAsyncResource(loadContracts, {
    initialData: EMPTY_CONTRACTS_RESOURCE,
    resetOnError: true,
    errorMessage: "加载合同失败",
  });

  useEffect(() => {
    setPage(1);
  }, [q, locationFilter, categoryFilter, lifecycleStatusFilter, view]);

  const totalPages = useMemo(() => Math.ceil(data.total / pageSize), [data.total, pageSize]);

  return {
    contracts: data.contracts,
    total: data.total,
    page,
    setPage,
    pageSize,
    setPageSize: (value: number) => { setPageSize(value); setPage(1); },
    totalPages,
    view,
    setView,
    q,
    setQ,
    locationFilter,
    setLocationFilter,
    categoryFilter,
    setCategoryFilter,
    lifecycleStatusFilter,
    setLifecycleStatusFilter,
    locations: data.locations,
    categories: data.categories,
    refresh,
  };
}
