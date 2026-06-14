import { useEffect, useMemo, useState, useCallback } from "react";
import type { Contract } from "../types";

const pageSize = 50;

export function useContracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allStatuses, setAllStatuses] = useState<string[]>([]);

  const fetchContracts = useCallback(async (p = page) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("pageSize", String(pageSize));
    if (q) params.set("q", q);
    if (locationFilter) params.set("location", locationFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/workspace/api/contracts?${params.toString()}`);
    const data = await res.json();
    setContracts(data.contracts || []);
    setTotal(data.total || 0);
    setAllLocations(data.locations || []);
    setAllCategories(data.categories || []);
    setAllStatuses(data.statuses || []);
  }, [q, locationFilter, categoryFilter, statusFilter, page]);

  useEffect(() => {
    setPage(1);
    fetchContracts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locationFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchContracts(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total]);

  return {
    contracts, total, page, setPage, totalPages,
    q, setQ,
    locationFilter, setLocationFilter,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
    locations: allLocations,
    categories: allCategories,
    statuses: allStatuses,
    refresh: () => fetchContracts(page),
  };
}
