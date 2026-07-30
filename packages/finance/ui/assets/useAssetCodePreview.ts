"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { workspacePath } from "@workspace/core/routing";
import type { CreateFinanceAssetCardInput } from "../../types/assets";

export function useAssetCodePreview(
  draft: CreateFinanceAssetCardInput | null,
  setDraft: Dispatch<SetStateAction<CreateFinanceAssetCardInput | null>>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const companyCode = draft?.companyCode ?? "";
  const year = draft?.accountYear ?? 0;
  const categoryId = draft?.categoryId ?? 0;

  useEffect(() => {
    setDraft((current) => current ? { ...current, assetCode: "" } : null);
    setError(null);
    if (!companyCode || !year || !categoryId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ companyCode, year: String(year), categoryId: String(categoryId) });
    void fetch(workspacePath(`/api/modules/finance/assets/code-preview?${params.toString()}`), { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { code?: string; error?: string } | null;
        if (!response.ok || !data?.code) throw new Error(data?.error || `编号预览失败 (${response.status})`);
        setDraft((current) => current
          && current.companyCode === companyCode
          && current.accountYear === year
          && current.categoryId === categoryId
          ? { ...current, assetCode: data.code }
          : current);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "编号预览失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [categoryId, companyCode, setDraft, year]);

  return { loading, error };
}
