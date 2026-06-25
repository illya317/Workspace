"use client";

import { useState } from "react";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import LibrarySidebar from "./LibrarySidebar";
import LibraryTable from "./LibraryTable";
import { EmptyStateCard, Pagination, SelectField, Toolbar, type ToolbarItem } from "@workspace/core/ui";
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
            <Toolbar
              items={[
                { kind: "custom", key: "title", section: "view", content: <span className="text-xs font-medium text-gray-500">目录</span> },
                ...(mode === "drawer"
                  ? [
                      {
                        kind: "action-group" as const,
                        key: "close",
                        section: "action" as const,
                        actions: [{ key: "close", kind: "cancel" as const, label: "关闭", onClick: () => setSidebarDrawerOpen(false) }],
                      },
                    ]
                  : []),
              ] satisfies ToolbarItem[]}
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
          <Toolbar
            items={[
              ...(canWrite
                ? [
                    {
                      kind: "icon-button" as const,
                      key: "primary",
                      section: "filter" as const,
                      icon: "add" as const,
                      label: "+ 生成文档",
                      variant: "primary" as const,
                      onClick: () => setShowGenerate(true),
                    },
                  ]
                : []),
              {
                kind: "search" as const,
                key: "search",
                section: "filter" as const,
                value: filters.keyword || "",
                onChange: (value: string) => setFilter("keyword", value || undefined),
                placeholder: "搜索",
                scope: ["标题", "文件名", "简介", "标签"] as const,
              },
              {
                kind: "custom" as const,
                key: "filters",
                section: "filter" as const,
                content: (
                  <>
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
                  </>
                ),
              },
              {
                kind: "icon-button" as const,
                key: "reset",
                section: "filter" as const,
                icon: "reset" as const,
                label: "清除筛选",
                onClick: clearFilters,
              },
            ] satisfies ToolbarItem[]}
          />
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
