"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback } from "react";
import { useAsyncResource } from "@workspace/core/hooks";
import type { DirectoryNode } from "@workspace/library/types";

const INITIAL_DIRECTORIES: DirectoryNode[] = [];

export interface LibraryDirectoryMutationResult {
  path: string;
  name: string;
  previousPath?: string;
}

async function directoryResponse(response: Response) {
  const body = await response.json().catch(() => null) as ({ error?: string; message?: string } & Partial<LibraryDirectoryMutationResult>) | null;
  if (!response.ok) throw new Error(body?.error || body?.message || `文件夹操作失败（${response.status}）`);
  return body as LibraryDirectoryMutationResult;
}

export async function createLibraryDirectory(parentPath: string, name: string) {
  return directoryResponse(await fetch(workspacePath("/api/modules/library/basic-info/directories"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentPath: parentPath || null, name }),
  }));
}

export async function renameLibraryDirectory(path: string, name: string) {
  return directoryResponse(await fetch(workspacePath("/api/modules/library/basic-info/directories"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name }),
  }));
}

export async function deleteLibraryDirectory(path: string) {
  return directoryResponse(await fetch(workspacePath("/api/modules/library/basic-info/directories/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }));
}

export function useLibraryDirectories() {
  const loadDirectories = useCallback(async () => {
    const response = await fetch(workspacePath("/api/modules/library/basic-info/directories"));
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json() as Promise<DirectoryNode[]>;
  }, []);

  const { data: directories, loading, error, refresh } = useAsyncResource(loadDirectories, {
    initialData: INITIAL_DIRECTORIES,
    resetOnError: true,
    errorMessage: "加载目录失败",
  });

  return { directories, loading, error, refresh };
}
