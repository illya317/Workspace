"use client";

import { useCallback, useEffect, useState } from "react";
import { useDebouncedEffect } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type {
  ExternalRelatedParty,
  ExternalRelatedPartyCandidate,
  ExternalRelatedPartyCandidateListResponse,
  ExternalRelatedPartyListResponse,
  ExternalPartyRelatedPartyType,
} from "@workspace/external/types";

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export function useRelatedParties() {
  const [items, setItems] = useState<ExternalRelatedParty[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [relatedPartyType, setRelatedPartyType] = useState<ExternalPartyRelatedPartyType | "">("");
  const [asOfDate, setAsOfDate] = useState("");
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
      if (relatedPartyType) params.set("relatedPartyType", relatedPartyType);
      if (asOfDate) params.set("asOfDate", asOfDate);
      const response = await fetch(`${workspacePath("/api/modules/external/related-parties")}?${params}`);
      const result = await response.json().catch(() => null) as ExternalRelatedPartyListResponse | { error?: string } | null;
      if (!response.ok) throw new Error(result && "error" in result ? result.error : `加载失败 (${response.status})`);
      const data = result as ExternalRelatedPartyListResponse;
      setItems(data.items);
      setTotal(data.total);
      setAsOfDate(data.asOfDate);
    } catch (caught) {
      setItems([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "关联方名录加载失败");
    } finally {
      setLoading(false);
    }
  }, [asOfDate, page, query, relatedPartyType]);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async (
    party: ExternalRelatedPartyCandidate,
    relatedType: ExternalRelatedParty["relatedPartyType"],
  ) => {
    const response = await fetch(workspacePath("/api/modules/external/related-parties"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `external-related-party:create:${crypto.randomUUID()}`,
        "If-Match": String(party.version),
      },
      body: JSON.stringify({ partyId: party.id, relatedPartyType: relatedType }),
    });
    const result = await response.json().catch(() => null) as { record?: ExternalRelatedParty; error?: string } | null;
    if (!response.ok) return { ok: false as const, error: errorMessage(result, `关联方登记失败 (${response.status})`) };
    await load();
    return { ok: true as const, record: result?.record ?? null };
  }, [load]);

  const remove = useCallback(async (party: ExternalRelatedParty) => {
    const response = await fetch(workspacePath(`/api/modules/external/related-parties/${party.id}`), {
      method: "DELETE",
      headers: {
        "Idempotency-Key": `external-related-party:delete:${crypto.randomUUID()}`,
        "If-Match": String(party.version),
      },
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) return { ok: false as const, error: errorMessage(result, `取消关联方失败 (${response.status})`) };
    await load();
    return { ok: true as const };
  }, [load]);

  return {
    items, keyword, setKeyword, relatedPartyType, setRelatedPartyType, asOfDate, setAsOfDate,
    page, setPage, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), loading, error, load, create, remove,
  };
}

export function useRelatedPartyCandidates(enabled: boolean, asOfDate: string) {
  const [items, setItems] = useState<ExternalRelatedPartyCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ page: "1", pageSize: "1000" });
    if (asOfDate) params.set("asOfDate", asOfDate);
    setLoading(true);
    setError(null);
    void fetch(`${workspacePath("/api/modules/external/related-parties/candidates")}?${params}`, {
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json().catch(() => null) as ExternalRelatedPartyCandidateListResponse | { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(result, `候选名单加载失败 (${response.status})`));
      setItems((result as ExternalRelatedPartyCandidateListResponse).items);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setItems([]);
      setError(caught instanceof Error ? caught.message : "候选名单加载失败");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [asOfDate, enabled]);

  return { items, loading, error };
}
