"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getInitials } from "@/lib/search";

// ─── Types ────────────────────────────────────────────────

export interface SearchFilters {
  company?: string;
  department?: string;
  project?: string;
  position?: string;
}

export interface SearchConfig<T = any> {
  /** What entity to search */
  target: "employee" | "department" | "position" | "project";
  /** "api" = debounced fetch, "client" = filter local array */
  mode?: "api" | "client";
  /** Required when mode="client" */
  clientData?: T[];
  /** Client-side match function (defaults to case-insensitive includes) */
  matchFn?: (item: T, query: string) => boolean;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** Minimum characters before searching (default 0) */
  minChars?: number;
  /** Show filter dropdowns */
  filters?: {
    company?: boolean;
    department?: boolean;
    project?: boolean;
    position?: boolean;
  };
  /** Pre-loaded filter options */
  filterOptions?: {
    companies?: string[];
    departments?: string[];
    projects?: Array<{ id: number; name: string }>;
    positions?: string[];
  };
}

export interface SearchState<T = any> {
  query: string;
  setQuery: (q: string) => void;
  results: T[];
  loading: boolean;
  error: string | null;
  showDropdown: boolean;
  setShowDropdown: (v: boolean) => void;
  filterValues: SearchFilters;
  setFilter: (key: keyof SearchFilters, value: string) => void;
  clearFilters: () => void;
}

// ─── Hook ─────────────────────────────────────────────────

export function useSearch<T = any>(config: SearchConfig<T>): SearchState<T> {
  const {
    target,
    mode = "api",
    clientData = [],
    matchFn,
    debounceMs = 300,
    minChars = 0,
  } = config;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterValues, setFilterValues] = useState<SearchFilters>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-side filter
  useEffect(() => {
    if (mode !== "client" || !clientData.length) return;
    const q = query.trim().toLowerCase();
    if (!q || q.length < minChars) {
      setResults(clientData);
      return;
    }
    const fn = matchFn || ((item: T, qq: string) => {
      const vals = Object.entries(item as any);
      for (const [k, v] of vals) {
        const sv = String(v ?? "").toLowerCase();
        if (sv.includes(qq)) return true;
        // name/alias 等字段自动走拼音首字母匹配（lib/search 统一实现）
        if ((k === "name" || k === "alias" || k === "employeeName" || k === "departmentName") && sv.length > 0) {
          if (getInitials(sv).includes(qq)) return true;
        }
      }
      return false;
    });
    setResults(clientData.filter((item) => fn(item, q)));
  }, [query, mode, clientData, matchFn, minChars]);

  // API debounced search
  useEffect(() => {
    if (mode !== "api") return;
    const q = query.trim();
    if (!q || q.length < minChars) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const apiPath = target === "employee"
          ? `/api/employees/search?q=${encodeURIComponent(q)}`
          : `/api/employees/autocomplete?type=${target}&q=${encodeURIComponent(q)}`;

        const res = await fetch(apiPath);
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();

        // Normalize result shape
        if (target === "employee") {
          setResults((data.items || []) as T[]);
        } else {
          setResults(((data.items || []) as any[]).map((v: any) =>
            typeof v === "string" ? { name: v } : v
          ) as T[]);
        }
      } catch {
        setError("搜索失败");
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, target, minChars, debounceMs]);

  const setFilter = useCallback((key: keyof SearchFilters, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilterValues({}), []);

  return {
    query, setQuery,
    results, loading, error,
    showDropdown, setShowDropdown,
    filterValues, setFilter, clearFilters,
  };
}
