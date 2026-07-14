"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { LibraryDocumentItem, LibraryDocumentVersionItem, LibraryFilters } from "@workspace/library/types";

interface DocumentsResult {
  documents: LibraryDocumentItem[];
  total: number;
}

interface DocumentVersionsResult {
  currentVersionId: number | null;
  versions: LibraryDocumentVersionItem[];
}

const EMPTY_DOCUMENT_RESULT: DocumentsResult = { documents: [], total: 0 };
const EMPTY_DOCUMENT_DETAIL: LibraryDocumentItem | null = null;
const EMPTY_DOCUMENT_VERSIONS: DocumentVersionsResult = { currentVersionId: null, versions: [] };

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

export function useLibraryDocumentVersions(id: number | null) {
  const fetchVersions = useCallback(async () => {
    if (!id) return { currentVersionId: null, versions: [] as LibraryDocumentVersionItem[] };
    const response = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}/versions`));
    if (!response.ok) throw new Error(`版本列表加载失败（${response.status}）`);
    const body = await response.json() as {
      currentVersionId?: number | null;
      versions?: LibraryDocumentVersionItem[];
    };
    return {
      currentVersionId: body.currentVersionId ?? null,
      versions: body.versions ?? [],
    };
  }, [id]);

  const { data, loading, error, refresh } = useAsyncResource(fetchVersions, {
    initialData: EMPTY_DOCUMENT_VERSIONS,
    errorMessage: "版本列表加载失败",
  });

  return { ...data, loading, error, refresh };
}

export function useLibraryPdfPreview(id: number | null, versionId?: number | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let active = true;

    setPreviewUrl(null);
    setError(null);
    setLoading(Boolean(id));
    if (!id) return () => controller.abort();

    void (async () => {
      try {
        const previewPath = versionId
          ? `/api/modules/library/basic-info/documents/${id}/versions/${versionId}/preview`
          : `/api/modules/library/basic-info/documents/${id}/preview`;
        const response = await fetch(workspacePath(previewPath), {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(
            response.status === 404
              ? "当前版本还没有生成预览文件。"
              : body?.error || `预览加载失败（${response.status}）`,
          );
        }
        const blob = await response.blob();
        if (blob.type && blob.type !== "application/pdf") throw new Error("预览文件格式无效。");
        objectUrl = URL.createObjectURL(blob);
        if (active) setPreviewUrl(objectUrl);
      } catch (previewError) {
        if (active && !controller.signal.aborted) {
          setError(previewError instanceof Error ? previewError.message : "预览加载失败。");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, versionId]);

  return { previewUrl, loading, error };
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

export async function deleteDocumentPermanently(id: number): Promise<{ success: true; cleanupPending: boolean }> {
  const response = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}/delete`), { method: "POST" });
  const body = await response.json().catch(() => null) as { success?: boolean; cleanupPending?: boolean; error?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.error || body?.message || `删除资料失败（${response.status}）`);
  return { success: true, cleanupPending: Boolean(body?.cleanupPending) };
}

export async function reviewDocument(id: number): Promise<LibraryDocumentItem> {
  const response = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}/review`), { method: "POST" });
  const body = await response.json().catch(() => null) as (LibraryDocumentItem & { error?: string; message?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || body?.message || `确认入库失败（${response.status}）`);
  return body;
}

export async function uploadDocumentVersion(
  id: number,
  file: File,
  changeNote: string,
): Promise<{ version: { id: number; versionNo: number; versionLabel: string | null } }> {
  const form = new FormData();
  form.set("file", file);
  if (changeNote.trim()) form.set("changeNote", changeNote.trim());

  const response = await fetch(workspacePath(`/api/modules/library/basic-info/documents/${id}/versions`), {
    method: "POST",
    body: form,
  });
  const body = await response.json().catch(() => null) as {
    version?: { id: number; versionNo: number; versionLabel: string | null };
    error?: string;
    message?: string;
  } | null;
  if (!response.ok || !body?.version) {
    throw new Error(body?.error || body?.message || `上传新版本失败（${response.status}）`);
  }
  return { version: body.version };
}
