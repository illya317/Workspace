"use client";

import { useCallback, useEffect, useState } from "react";
import { useDebouncedEffect } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type { ProductCatalogResponse, ProductDraft, ProductSkuDraft } from "@workspace/production/types";

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export function useProducts() {
  const endpoint = workspacePath("/api/modules/production/products");
  const [data, setData] = useState<ProductCatalogResponse>({
    items: [],
    total: 0,
    skuCount: 0,
    sourceMappingCount: 0,
    pendingMappingCount: 0,
    pendingMappings: [],
  });
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useDebouncedEffect(useCallback(() => setQuery(keyword.trim()), [keyword]), 300);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("keyword", query);
      const response = await fetch(`${endpoint}?${params.toString()}`);
      const body = await response.json().catch(() => null) as ProductCatalogResponse | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(body, `加载失败 (${response.status})`));
      setData(body as ProductCatalogResponse);
    } catch (caught) {
      setData({
        items: [],
        total: 0,
        skuCount: 0,
        sourceMappingCount: 0,
        pendingMappingCount: 0,
        pendingMappings: [],
      });
      setError(caught instanceof Error ? caught.message : "产品主档加载失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint, query]);

  useEffect(() => { void load(); }, [load]);

  const request = useCallback(async (path: string, method: "POST" | "PATCH", body: unknown) => {
    const response = await fetch(workspacePath(path), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null) as { record?: ProductCatalogResponse["items"][number]; error?: string } | null;
    if (!response.ok) return { ok: false as const, error: errorMessage(result, `保存失败 (${response.status})`) };
    await load();
    return { ok: true as const, record: result?.record ?? null };
  }, [load]);

  const saveProduct = useCallback((draft: ProductDraft, id?: number) => request(id ? `/api/modules/production/products/${id}` : "/api/modules/production/products", id ? "PATCH" : "POST", { ...draft, ...(id ? { expectedVersion: draft.version } : {}) }), [request]);
  const saveSku = useCallback((productId: number, draft: ProductSkuDraft, id?: number) => request(id ? `/api/modules/production/products/skus/${id}` : `/api/modules/production/products/${productId}/skus`, id ? "PATCH" : "POST", { ...draft, ...(id ? { expectedVersion: draft.version } : {}) }), [request]);

  return { ...data, keyword, setKeyword, loading, error, load, saveProduct, saveSku };
}
