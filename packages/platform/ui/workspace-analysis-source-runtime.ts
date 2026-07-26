"use client";

import { workspacePath } from "@workspace/core/routing";
import type {
  WorkspaceApiQueryValue,
  WorkspaceApiSource,
} from "../workspace-analysis-source-contract";

export type WorkspaceAnalysisScope = {
  scopeType: "personal" | "department" | "project";
  scopeId: number;
};

export type WorkspaceAnalysisSourceRow = Record<string, unknown>;

export function readWorkspaceAnalysisSourceValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function extractWorkspaceAnalysisSourceRows(payload: unknown, rowsPath: string): WorkspaceAnalysisSourceRow[] {
  const rows = readWorkspaceAnalysisSourceValue(payload, rowsPath);
  if (!Array.isArray(rows)) throw new Error(`响应字段 ${rowsPath} 不是数组`);
  return rows.filter((row): row is WorkspaceAnalysisSourceRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

export async function loadWorkspaceAnalysisSource(
  source: WorkspaceApiSource,
  scope: WorkspaceAnalysisScope,
  signal: AbortSignal,
) {
  const baseQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(source.query ?? {})) {
    baseQuery.set(key, resolveWorkspaceAnalysisQueryValue(value, scope));
  }
  if (!source.pagination) return fetchWorkspaceAnalysisPage(source, baseQuery, signal).then((page) => page.rows);

  const rows: WorkspaceAnalysisSourceRow[] = [];
  const pageSize = source.pagination.pageSize ?? 500;
  const maxPages = source.pagination.maxPages ?? 20;
  const pageParam = source.pagination.pageParam ?? "page";
  const pageSizeParam = source.pagination.pageSizeParam ?? "pageSize";
  let total = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= maxPages && rows.length < total; page += 1) {
    const query = new URLSearchParams(baseQuery);
    query.set(pageParam, String(page));
    query.set(pageSizeParam, String(pageSize));
    const result = await fetchWorkspaceAnalysisPage(source, query, signal);
    const rawTotal = readWorkspaceAnalysisSourceValue(result.payload, source.pagination.totalPath);
    total = typeof rawTotal === "number" ? rawTotal : Number(rawTotal);
    if (!Number.isFinite(total) || total < 0) throw new Error(`${source.label || source.key}：分页总数字段无效`);
    rows.push(...result.rows);
    if (result.rows.length < pageSize) break;
  }
  if (rows.length < total) throw new Error(`${source.label || source.key}：数据超过模板允许的最大分页数`);
  return rows;
}

async function fetchWorkspaceAnalysisPage(
  source: WorkspaceApiSource,
  query: URLSearchParams,
  signal: AbortSignal,
) {
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`${workspacePath(source.path)}${suffix}`, { signal });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? (payload as { error?: unknown }).error : null;
    throw new Error(`${source.label || source.key}：${typeof error === "string" ? error : `HTTP ${response.status}`}`);
  }
  return { payload, rows: extractWorkspaceAnalysisSourceRows(payload, source.rowsPath) };
}

function resolveWorkspaceAnalysisQueryValue(value: WorkspaceApiQueryValue, scope: WorkspaceAnalysisScope) {
  if (typeof value !== "object") return String(value);
  return value.binding === "scopeId" ? String(scope.scopeId) : scope.scopeType;
}
