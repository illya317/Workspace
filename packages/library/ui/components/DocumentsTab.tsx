"use client";

import { useState } from "react";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import LibrarySidebar from "./LibrarySidebar";
import LibraryTable from "./LibraryTable";
import { ActionToolbar, EmptyStateCard, FilterToolbar, Pagination, SelectField } from "@workspace/core/ui";
import { WorkspaceSplitPage } from "@workspace/core/ui";
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
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
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
    <>
      <WorkspaceSplitPage
        sideOpen={sidebarOpen}
        drawerOpen={sidebarDrawerOpen}
        sideLabel="目录"
        onSideOpenChange={setSidebarOpen}
        onDrawerOpenChange={setSidebarDrawerOpen}
        renderSide={(mode) => (
          <>
            <ActionToolbar
              leftSlot={<span className="text-xs font-medium text-gray-500">目录</span>}
              secondaryActions={mode === "drawer" ? [{ label: "关闭", kind: "cancel", onClick: () => setSidebarDrawerOpen(false) }] : []}
              className="mb-3"
            />
            {dirError && <EmptyStateCard compact className="mb-3 border-red-100 bg-red-50 text-red-600">目录加载失败: {dirError}</EmptyStateCard>}
            <LibrarySidebar
              directories={directories}
              selectedPath={filters.directoryPath || null}
              onSelectPath={(path) => {
                handleSelectDirectory(path);
                setSidebarDrawerOpen(false);
              }}
              loading={dirLoading}
            />
          </>
        )}
        beforeSplit={(
          <FilterToolbar
            keyword={filters.keyword || ""}
            onKeywordChange={(value) => setFilter("keyword", value || undefined)}
            searchScope={["标题", "文件名", "简介", "标签"]}
            searchPlaceholder="搜索"
            onReset={clearFilters}
            resetLabel="清除筛选"
            primaryAction={canWrite ? { label: "+ 生成文档", onClick: () => setShowGenerate(true) } : undefined}
          >
            <SelectField
              value={filters.status || ""}
              onChange={(value) => setFilter("status", value || undefined)}
              options={STATUS_OPTIONS.slice(1)}
              placeholder={STATUS_OPTIONS[0]?.label}
            />
            <SelectField
              value={filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : ""}
              onChange={(value) =>
                setFilter("confidentialityLevel", value ? parseInt(value, 10) : undefined)
              }
              options={CONFIDENTIALITY_OPTIONS.slice(1)}
              placeholder={CONFIDENTIALITY_OPTIONS[0]?.label}
            />
          </FilterToolbar>
        )}
      >
        {error && <EmptyStateCard compact className="mt-4 border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}

        <div>
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
      </WorkspaceSplitPage>

      {showGenerate && (
        <GenerateDocumentModal onClose={() => setShowGenerate(false)} onSuccess={handleUpdated} />
      )}
    </>
  );
}
