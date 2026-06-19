"use client";

import { useState } from "react";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import LibrarySidebar from "./LibrarySidebar";
import LibraryTable from "./LibraryTable";
import { ActionButton, ActionToolbar, FilterToolbar, PageContent, Pagination, SearchInput, SelectField } from "@workspace/core/ui";
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
        <ActionToolbar
          leftSlot={<span className="text-xs font-medium text-gray-500">目录</span>}
          secondaryActions={[{ label: "收起", onClick: () => setSidebarOpen(false) }]}
          className="rounded-none border-0 border-b px-3 py-2 shadow-none"
        />
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
          <ActionButton
            onClick={() => setSidebarOpen(true)}
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-l-none px-2 py-4"
          >
            目录
          </ActionButton>
        )}

        <PageContent className="py-6">
          <FilterToolbar
            extraRight={canWrite ? (
              <ActionButton onClick={() => setShowGenerate(true)} variant="primary">
                + 生成文档
              </ActionButton>
            ) : undefined}
          >
            <SearchInput
              value={filters.keyword || ""}
              onChange={(value) => setFilter("keyword", value || undefined)}
              placeholder="搜索标题、文件名、简介..."
              size="toolbar"
              className="w-full sm:w-[22rem]"
            />
            <SearchInput
              value={filters.tag || ""}
              onChange={(value) => setFilter("tag", value || undefined)}
              placeholder="标签筛选"
              size="toolbar"
              className="w-full sm:w-48"
            />
            <SelectField
              value={filters.status || ""}
              onChange={(value) => setFilter("status", value || undefined)}
              options={STATUS_OPTIONS.slice(1)}
              placeholder={STATUS_OPTIONS[0]?.label}
              className="w-32"
              size="toolbar"
            />
            <SelectField
              value={filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : ""}
              onChange={(value) =>
                setFilter("confidentialityLevel", value ? parseInt(value, 10) : undefined)
              }
              options={CONFIDENTIALITY_OPTIONS.slice(1)}
              placeholder={CONFIDENTIALITY_OPTIONS[0]?.label}
              className="w-36"
              size="toolbar"
            />
            <ActionButton onClick={clearFilters}>
              清除筛选
            </ActionButton>
          </FilterToolbar>

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
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              className="mt-4 flex items-center justify-center gap-3"
              compact
            />
          )}
        </PageContent>
      </div>

      {showGenerate && (
        <GenerateDocumentModal onClose={() => setShowGenerate(false)} onSuccess={handleUpdated} />
      )}
    </div>
  );
}
