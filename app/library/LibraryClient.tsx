"use client";

import { useState } from "react";
import { useLibraryDocuments } from "./hooks/useLibraryDocuments";
import { useLibraryFilters } from "./hooks/useLibraryFilters";
import { useLibraryCategories } from "./hooks/useLibraryCategories";
import LibrarySidebar from "./components/LibrarySidebar";
import LibraryTable from "./components/LibraryTable";
import SearchBox from "@/app/components/SearchBox";
import DueDiligencePanel from "./due-diligence/components/DueDiligencePanel";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "missing", label: "缺失" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" },
];

const ORIGIN_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "scanned", label: "扫描" },
  { value: "uploaded", label: "上传" },
  { value: "generated", label: "生成" },
  { value: "manual", label: "手动" },
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
  rootLabel: string;
}

export default function LibraryClient({ rootLabel }: Props) {
  const [activeTab, setActiveTab] = useState<"documents" | "due-diligence">("documents");

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Tab bar */}
      <div className="border-b bg-white px-6 pt-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("documents")}
            className={`pb-2 text-sm font-medium border-b-2 transition ${
              activeTab === "documents"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {rootLabel}
          </button>
          <button
            onClick={() => setActiveTab("due-diligence")}
            className={`pb-2 text-sm font-medium border-b-2 transition ${
              activeTab === "due-diligence"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            尽调问卷
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "documents" ? <DocumentsTab /> : <DueDiligencePanel />}
      </div>
    </div>
  );
}

function DocumentsTab() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { filters, setFilter, clearFilters, page, setPage, pageSize } = useLibraryFilters();
  const { documents, total, loading, error, refresh } = useLibraryDocuments(filters, page, pageSize);
  const { categories, loading: categoriesLoading, refresh: refreshCategories } = useLibraryCategories();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleUpdated = () => {
    refresh();
    refreshCategories();
  };

  return (
    <div className="flex h-full">
      {/* ── 侧边栏：分类树 ── */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r bg-white transition-all`}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-gray-500">分类</span>
          <button onClick={() => setSidebarOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
        <LibrarySidebar
          categories={categories}
          selectedCategory={filters.categoryCode || null}
          onSelectCategory={(code) => setFilter("categoryCode", code || undefined)}
          loading={categoriesLoading}
        />
      </div>

      {/* ── 右侧内容区 ── */}
      <div className="relative flex-1 overflow-y-auto">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r bg-white px-2 py-4 shadow-md text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        <main className="mx-auto max-w-5xl px-6 py-6">
          {/* 筛选栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.origin || ""}
              onChange={(e) => setFilter("origin", e.target.value || undefined)}
              className="rounded border px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {ORIGIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : ""}
              onChange={(e) => setFilter("confidentialityLevel", e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="rounded border px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {CONFIDENTIALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={clearFilters}
              className="rounded px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            >
              清除筛选
            </button>
          </div>

          {error && <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

          <LibraryTable documents={documents} loading={loading} onRefresh={handleUpdated} />

          {/* 分页 */}
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
    </div>
  );
}
