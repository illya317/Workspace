"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { LibraryDocumentItem, LibraryFilters } from "@workspace/library/types";

interface DocumentsResult {
  documents: LibraryDocumentItem[];
  total: number;
}

const EMPTY_DOCUMENT_RESULT: DocumentsResult = { documents: [], total: 0 };
const EMPTY_DOCUMENT_DETAIL: LibraryDocumentItem | null = null;

export function useLibraryDocuments(filters: LibraryFilters, page: number, pageSize: number) {
  const fetchDocuments = useCallback(async () => {
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

    const res = await fetch(workspacePath(`/api/modules/library/basic-info/documents?${params.toString()}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<DocumentsResult>;
  }, [filters, page, pageSize]);

  const { data, loading, error, refresh } = useAsyncResource(fetchDocuments, {
    initialData: EMPTY_DOCUMENT_RESULT,
    errorMessage: "Failed to load documents",
  });

  return { ...data, loading, error, refresh };
}

export function useDocumentDetail(id: number | null) {
  const fetchDoc = useCallback(async () => {
    if (!id) return null;
    const response = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}`));
    return response.ok ? response.json() as Promise<LibraryDocumentItem> : null;
  }, [id]);

  const { data: doc, setData: setDoc, loading, refresh } = useAsyncResource(fetchDoc, {
    initialData: EMPTY_DOCUMENT_DETAIL,
    errorMessage: "加载文档详情失败",
  });

  return { doc, loading, setDoc, refresh };
}

export async function updateDocument(id: number, body: Record<string, unknown>): Promise<LibraryDocumentItem> {
  const res = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}`), {
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

export async function archiveDocument(id: number): Promise<void> {
  const res = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Archive failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}
