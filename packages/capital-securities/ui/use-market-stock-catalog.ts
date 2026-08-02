"use client";

import { useEffect, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import type { MarketStockCatalogSearchResult } from "../types/market-intelligence";

const ENDPOINT = "/api/modules/capitalSecurities/market-intelligence";
const SEARCH_DELAY_MS = 300;

export function useMarketStockCatalog(input: { active: boolean; query: string }) {
  const [result, setResult] = useState<MarketStockCatalogSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = input.query.trim();
    if (!input.active || !query) {
      setResult(null);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setResult(null);
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ catalog: "stocks", q: query });
        const response = await fetch(workspacePath(`${ENDPOINT}?${params.toString()}`), {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as MarketStockCatalogSearchResult | { error?: string } | null;
        if (!response.ok) throw new Error(apiError(payload, `股票目录搜索失败 (${response.status})`));
        setResult(payload as MarketStockCatalogSearchResult);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "股票目录搜索失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input.active, input.query]);

  return { result, loading, error };
}

function apiError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}
