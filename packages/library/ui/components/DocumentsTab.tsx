"use client";

import { useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import { createEmptySection, createPageBody, PageSurface } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec, DataSurfaceProps, BodySurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import GenerateDocumentModal from "./GenerateDocumentModal";
import LibraryDetailModal from "./LibraryDetailModal";
import type { DirectoryNode, LibraryDocumentItem } from "@workspace/library/types";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS,
} from "./library-document-options";
import { declareDirectoryTreeItems } from "./directory-selector";

interface Props {
  canUpdate?: boolean;
  canArchive?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DocumentsTab({ canUpdate, canArchive, canImport, canExport, canConfigure }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { filters, setFilter, clearFilters, page, setPage, pageSize } = useLibraryFilters();
  const { documents, total, loading, error, refresh } = useLibraryDocuments(filters, page, pageSize);
  const { directories, loading: dirLoading, error: dirError, refresh: refreshDirs } = useLibraryDirectories();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rootDirectories = useMemo<DirectoryNode[]>(() => {
    const allRoot: DirectoryNode = {
      path: "",
      name: "全部",
      count: 0,
      children: [],
    };
    return [allRoot, ...directories];
  }, [directories]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  const handleUpdated = () => {
    refresh();
    refreshDirs();
  };

  const handleSelectDirectory = (path: string | null) => {
    setFilter("directoryPath", path || undefined);
    if (path) setFilter("categoryCode", undefined);
  };

  const toolbarItems: SurfaceToolbarItems = [];
  if (canImport) {
    toolbarItems.push({
      kind: "action-group",
      key: "import-actions",
      actions: [{
        key: "generate",
        kind: "generate",
        label: "生成文档",
        variant: "primary",
        onClick: () => setShowGenerate(true),
      }],
    });
  }
  toolbarItems.push(
    {
      kind: "search",
      key: "search",
      value: filters.keyword || "",
      onChange: (value: string) => setFilter("keyword", value || undefined),
      placeholder: "搜索",
      scope: ["标题", "文件名", "简介", "标签"],
    },
    {
      kind: "select",
      key: "status-filter",
      value: filters.status || "",
      onChange: (value: string) => setFilter("status", value || undefined),
      options: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "select",
      key: "confidentiality-filter",
      value: filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : "",
      onChange: (value: string) =>
        setFilter("confidentialityLevel", value ? parseInt(value, 10) : undefined),
      options: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "icon-button",
      key: "reset",
      icon: "reset",
      label: "清除筛选",
      onClick: clearFilters,
    },
  );
  const columns: DataSurfaceColumnSpec<LibraryDocumentItem>[] = [
    {
      key: "fileName",
      label: "文件名",
      required: true,
      cell: (document) => ({ kind: "stack", items: [
        { kind: "text", value: document.fileName, emphasis: "medium", wrap: "truncate" },
        ...(document.title && document.title !== document.fileName ? [{ kind: "text" as const, value: document.title, tone: "muted" as const, wrap: "truncate" as const }] : []),
        ...(document.docId ? [{ kind: "text" as const, value: document.docId, tone: "success" as const, emphasis: "medium" as const, wrap: "truncate" as const }] : []),
      ] }),
    },
    {
      key: "summary",
      label: "简介",
      defaultVisible: true,
      tone: "muted",
      cell: (document) => ({ kind: "text", value: document.summary || "—", tone: "muted", wrap: "truncate" }),
    },
    {
      key: "updatedAt",
      label: "更新时间",
      defaultVisible: true,
      tone: "muted",
      cell: (document) => fmtDate(document.updatedAt),
    },
    {
      key: "tags",
      label: "标签",
      defaultVisible: true,
      cell: (document) => document.tags && document.tags.length > 0 ? ({ kind: "selectionGrid", mode: "readOnly", layout: "auto", minItemWidth: "sm", options: document.tags.map((tag) => ({ value: tag, label: tag })), ariaLabel: "文档标签" }) : { kind: "empty" },
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      cell: (document) => canExport && document.status === "active" ? ({ kind: "action", action: {
              key: "download",
              label: "下载",
              icon: "download",
              onClick: () => window.open(workspacePath(`/api/modules/library/basic-info/documents/${document.id}/download`), "_blank", "noopener,noreferrer"),
              presentation: "glyph",
              size: "sm",
      } }) : null,
    },
  ];
  const sections: BodySurfaceSectionSpec[] = [
    ...(error
      ? [createEmptySection("error", {
          compact: true,

          content: error,
        })]
      : []),
    {
      key: "documents",
      body: { kind: "data", data: ({
        kind: "table",

        rows: documents,
        columns,
        visibleColumns: columns.map((column) => column.key),
        rowKey: (document) => document.id,
        onRowClick: (document) => setDetailId(document.id),
        loading,
        emptyText: loading ? "加载中..." : "暂无资料",
      } satisfies DataSurfaceProps<LibraryDocumentItem>) as DataSurfaceProps },
    },
  ];

  return (
    <>
      <PageSurface kind="standard"
        toolbar={{ items: toolbarItems }}
        body={{
          kind: "section",
          layout: "split",
          left: {
            kind: "selector",
            selector: {
              kind: "tree",
              items: dirError ? [] : declareDirectoryTreeItems(rootDirectories),
              selectedId: filters.directoryPath || "",
              onSelect: (node: DirectoryNode) => {
                handleSelectDirectory(node.path || null);
                setSidebarDrawerOpen(false);
              },
              expandedIds: expandedPaths,
              onToggle: (path, expanded) => {
                const key = String(path);
                setExpandedPaths((prev) => {
                  const next = new Set(prev);
                  if (expanded) next.add(key);
                  else next.delete(key);
                  return next;
                });
              },
              loading: dirLoading,
              loadingText: "加载中...",
              emptyText: dirError ? `目录加载失败: ${dirError}` : "暂无目录",
            },
          },
          right: createPageBody(sections),
          sideOpen: sidebarOpen,
          drawerOpen: sidebarDrawerOpen,
          sideLabel: "目录",
          onSideOpenChange: setSidebarOpen,
          onDrawerOpenChange: setSidebarDrawerOpen,
        }}
        footer={totalPages > 1 ? {
          pagination: {
            page,
            totalPages,
            total,
            onPageChange: setPage,

            compact: true,
          },
        } : undefined}
      />

      {detailId !== null && (
        <LibraryDetailModal
          documentId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={handleUpdated}
          canUpdate={canUpdate}
          canArchive={canArchive}
          canExport={canExport}
          canConfigure={canConfigure}
        />
      )}

      {showGenerate && (
        <GenerateDocumentModal
          onClose={() => setShowGenerate(false)}
          onSuccess={handleUpdated}
          canConfigure={canConfigure}
        />
      )}
    </>
  );
}
