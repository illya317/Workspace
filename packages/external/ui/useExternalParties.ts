"use client";

import { useCallback, useEffect, useState } from "react";
import { useDebouncedEffect } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type { ExternalParty, ExternalPartyDraft, ExternalPartyListResponse } from "@workspace/external/types";
import { directCommandFetch } from "@workspace/platform/ui/api-client";

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export function useExternalParties(apiPath: string) {
  const endpoint = workspacePath(apiPath);
  const [items, setItems] = useState<ExternalParty[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;

  const syncQuery = useCallback(() => {
    setQuery(keyword.trim());
    setPage(1);
  }, [keyword]);
  useDebouncedEffect(syncQuery, 300);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (query) params.set("keyword", query);
      const response = await fetch(`${endpoint}?${params.toString()}`);
      const data = await response.json().catch(() => null) as ExternalPartyListResponse | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data, `加载失败 (${response.status})`));
      const result = data as ExternalPartyListResponse;
      setItems(result.items);
      setTotal(result.total);
    } catch (caught) {
      setItems([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, query]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (draft: ExternalPartyDraft) => {
    const editing = Boolean(draft.id);
    const response = await directCommandFetch(editing ? `${endpoint}/${draft.id}` : endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(editing && draft.version ? { "If-Match": String(draft.version) } : {}),
      },
      body: JSON.stringify({
        ...(!editing && draft.existingPartyId ? { existingPartyId: draft.existingPartyId } : {}),
        subjectType: draft.subjectType,
        relatedPartyType: draft.relatedPartyType,
        code: draft.code,
        name: draft.name,
        fullName: draft.fullName,
        classification: draft.classification,
        identityNumber: draft.identityNumber,
        legalRepresentative: draft.legalRepresentative,
        contactPerson: draft.contactPerson,
        phone: draft.phone,
        email: draft.email,
        bankName: draft.bankName,
        bankAccount: draft.bankAccount,
        address: draft.address,
        invoiceTitle: draft.invoiceTitle,
        invoiceAddressPhone: draft.invoiceAddressPhone,
        settlementTerms: draft.settlementTerms,
        creditLimit: draft.creditLimit,
        creditDays: draft.creditDays,
        taxRate: draft.taxRate,
        remark: draft.remark,
      }),
    });
    const data = await response.json().catch(() => null) as { record?: ExternalParty; error?: string } | null;
    if (!response.ok) return { ok: false as const, error: errorMessage(data, `保存失败 (${response.status})`) };
    await load();
    return { ok: true as const, record: data?.record ?? null };
  }, [endpoint, load]);

  const remove = useCallback(async (item: ExternalParty) => {
    const response = await directCommandFetch(`${endpoint}/${item.id}`, {
      method: "DELETE",
      headers: { "If-Match": String(item.version) },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false as const, error: errorMessage(data, `结束失败 (${response.status})`) };
    await load();
    return { ok: true as const };
  }, [endpoint, load]);

  return {
    items,
    keyword,
    setKeyword,
    page,
    setPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    loading,
    error,
    load,
    save,
    remove,
  };
}

export function useExternalPartyCandidates(apiPath: string | undefined, enabled: boolean) {
  const endpoint = apiPath ? workspacePath(apiPath) : null;
  const [items, setItems] = useState<ExternalParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoint || !enabled) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`${endpoint}?page=1&pageSize=1000`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as ExternalPartyListResponse | { error?: string } | null;
        if (!response.ok) throw new Error(errorMessage(data, `加载已有主体失败 (${response.status})`));
        setItems((data as ExternalPartyListResponse).items);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(caught instanceof Error ? caught.message : "加载已有主体失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, endpoint]);

  return { items, loading, error };
}
