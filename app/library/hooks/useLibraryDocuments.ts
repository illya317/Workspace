"use client";

import { useState, useEffect, useCallback } from "react";
import type { LibraryDocumentItem, LibraryFilters } from "../types";

interface DocumentsResult {
  documents: LibraryDocumentItem[];
  total: number;
}

export function useLibraryDocuments(filters: LibraryFilters, page: number, pageSize: number) {
  const [data, setData] = useState<DocumentsResult>({ documents: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filters.categoryCode) params.set("categoryCode", filters.categoryCode);
      if (filters.directoryPath) params.set("directoryPath", filters.directoryPath);
      if (filters.status) params.set("status", filters.status);
      if (filters.origin) params.set("origin", filters.origin);
      if (filters.confidentialityLevel !== undefined) params.set("confidentialityLevel", String(filters.confidentialityLevel));
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.docId) params.set("docId", filters.docId);
      if (filters.tag) params.set("tag", filters.tag);

      const res = await fetch(`/api/library/documents?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  return { ...data, loading, error, refresh: fetchDocuments };
}

export function useDocumentDetail(id: number | null) {
  const [doc, setDoc] = useState<LibraryDocumentItem | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDoc = useCallback(() => {
    if (!id) { setDoc(null); return; }
    setLoading(true);
    fetch(`/api/library/documents/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDoc(d))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  return { doc, loading, setDoc, refresh: fetchDoc };
}

export async function updateDocument(id: number, body: Record<string, unknown>): Promise<LibraryDocumentItem> {
  const res = await fetch(`/api/library/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Update failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteDocument(id: number): Promise<void> {
  const res = await fetch(`/api/library/documents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Delete failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}
