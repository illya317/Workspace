"use client";

import { useState } from "react";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import LibrarySidebar from "./LibrarySidebar";
import LibraryTable from "./LibraryTable";
import SearchBox from "@/app/components/SearchBox";
import FilterBar from "@/app/components/FilterBar";
import GenerateDocumentModal from "./GenerateDocumentModal";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "missing", label: "缺失" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" },
];

const CONFIDENTIALITY_OPTIONS = [
  { value: "", label: "全部保密等级" },
  { value: "0", label: "公开" },
  { value: "1", label: "内部" },
  { value: "2", label: "普通" },
  { value: "3", label: "机密" },
  { value: "4", label: "绝密" },
];

interface Props {
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

export default function DocumentsTab({ canWrite, canDelete, canAdmin }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const { filters, setFilter, clearFilters, page, setPage, pageSize } = useLibraryFilters();
  const { documents, total, loading, error, refresh } = useLibraryDocuments(filters, page, pageSize);
  const { directories, loading: dirLoading, error: dirError, refresh: refreshDirs } = useLibraryDirectories();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleUpdated = () => {
    refresh();
    refreshDirs();
  };

  const handleSelectDirectory = (path: string | null) => {
    setFilter("directoryPath", path || undefined);
    if (path) setFilter("categoryCode", undefined);
  };

  return (
    <div className="flex h-full">
      <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r bg-white transition-all`}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-gray-500">目录</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {dirError && (
          <div className="px-3 py-2 text-xs text-red-500">目录加载失败: {dirError}</div>
        )}
        <LibrarySidebar
          directories={directories}
          selectedPath={filters.directoryPath || null}
          onSelectPath={handleSelectDirectory}
          loading={dirLoading}
        />
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r bg-white px-2 py-4 shadow-md text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <main className="mx-auto max-w-5xl px-6 py-6">
          <FilterBar>
            <SearchBox
              compact
              query={filters.keyword || ""}
              onQueryChange={(v) => setFilter("keyword", v || undefined)}
              placeholder="搜索标题、文件名、简介..."
            />
            <select
              value={filters.status || ""}
              onChange={(e) => setFilter("status", e.target.value || undefined)}
              className="rounded border px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : ""}
              onChange={(e) =>
                setFilter("confidentialityLevel", e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              className="rounded border px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {CONFIDENTIALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={clearFilters}
              className="rounded px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            >
              清除筛选
            </button>
            {canWrite && (
              <button
                onClick={() => setShowGenerate(true)}
                className="ml-auto rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 transition"
              >
                + 生成文档
              </button>
            )}
          </FilterBar>

          {error && <div className="mt-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

          <div className="mt-4">
            <LibraryTable
              documents={documents}
              loading={loading}
              onRefresh={handleUpdated}
              canWrite={canWrite}
              canDelete={canDelete}
              canAdmin={canAdmin}
            />
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-3 py-1.5 text-sm border hover:bg-gray-50 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">
                第 {page} / {totalPages} 页，共 {total} 条
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded px-3 py-1.5 text-sm border hover:bg-gray-50 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </main>
      </div>

      {showGenerate && (
        <GenerateDocumentModal onClose={() => setShowGenerate(false)} onSuccess={handleUpdated} />
      )}
    </div>
  );
}
