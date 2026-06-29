"use client";

import { useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import { useLibraryDirectories } from "../hooks/useLibraryDirectories";
import { createEmptySection, createPageBody, PageSurface } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec, DataSurfaceProps, PageSurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import GenerateDocumentModal from "./GenerateDocumentModal";
import LibraryDetailModal from "./LibraryDetailModal";
import type { DirectoryNode, LibraryDocumentItem } from "@workspace/library/types";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS,
} from "./library-document-options";

interface Props {
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DocumentsTab({ canWrite, canDelete, canAdmin }: Props) {
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
  const initialExpandedPaths = useMemo(() => {
    const next = new Set<string>();
    function visit(nodes: DirectoryNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          next.add(node.path);
          visit(node.children);
        }
      }
    }
    visit(directories);
    return next;
  }, [directories]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialExpandedPaths);

  const handleUpdated = () => {
    refresh();
    refreshDirs();
  };

  const handleSelectDirectory = (path: string | null) => {
    setFilter("directoryPath", path || undefined);
    if (path) setFilter("categoryCode", undefined);
  };

  function getChildren(node: DirectoryNode): DirectoryNode[] | undefined {
    return node.children.length > 0 ? node.children : undefined;
  }

  const toolbarItems: SurfaceToolbarItems = [
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
      kind: "search",
      key: "search",
      section: "filter",
      value: filters.keyword || "",
      onChange: (value: string) => setFilter("keyword", value || undefined),
      placeholder: "搜索",
      scope: ["标题", "文件名", "简介", "标签"],
    },
    {
      kind: "select",
      key: "status-filter",
      section: "filter",
      value: filters.status || "",
      onChange: (value: string) => setFilter("status", value || undefined),
      options: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "select",
      key: "confidentiality-filter",
      section: "filter",
      value: filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : "",
      onChange: (value: string) =>
        setFilter("confidentialityLevel", value ? parseInt(value, 10) : undefined),
      options: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "icon-button",
      key: "reset",
      section: "filter",
      icon: "reset",
      label: "清除筛选",
      onClick: clearFilters,
    },
  ];
  const columns: DataSurfaceColumnSpec<LibraryDocumentItem>[] = [
    {
      key: "fileName",
      label: "文件名",
      required: true,
      cell: (document) => (
        <div>
          <div className="max-w-xs truncate font-medium text-gray-800">{document.fileName}</div>
          {document.title && document.title !== document.fileName && (
            <div className="max-w-xs truncate text-xs text-gray-400">{document.title}</div>
          )}
          {document.docId && (
            <div className="max-w-xs truncate text-xs font-medium text-emerald-600">{document.docId}</div>
          )}
        </div>
      ),
    },
    {
      key: "summary",
      label: "简介",
      defaultVisible: true,
      tone: "muted",
      cell: (document) => (
        <span className="block max-w-48 truncate" title={document.summary || ""}>
          {document.summary || "—"}
        </span>
      ),
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
      cell: (document) => document.tags && document.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {document.tags.map((tag) => (
            <span key={tag} className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {tag}
            </span>
          ))}
        </div>
      ) : <span className="text-gray-300">—</span>,
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      cell: (document) => document.status === "active" ? (
        <a
          href={workspacePath(`/api/modules/library/basic-info/documents/${document.id}/download`)}
          className="inline-flex items-center text-emerald-600 hover:text-emerald-700"
          title="下载"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          下载
        </a>
      ) : null,
    },
  ];
  const sideBlocks: PageSurfaceSectionSpec[] = [
    ...(dirError
      ? [createEmptySection("dir-error", {
          compact: true,

          content: `目录加载失败: ${dirError}`,
        })]
      : []),
    {
      kind: "navigation",
      key: "directories",
      surface: {
        kind: "selector",
        selector: {
          mode: "tree",
          items: rootDirectories,
          selectedId: filters.directoryPath || "",
          onSelect: (node) => {
            handleSelectDirectory(node.path || null);
            setSidebarDrawerOpen(false);
          },
          getKey: (node) => node.path,
          getChildren,
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
          renderItem: (node, ctx) => ({
            title: node.name,
            code: node.path === "" ? undefined : node.count,
            level: ctx.level,
          }),
          framed: false,
          loading: dirLoading,
          loadingText: "加载中...",
        },
      },
    },
  ];
  const sections: PageSurfaceSectionSpec[] = [
    ...(error
      ? [createEmptySection("error", {
          compact: true,

          content: error,
        })]
      : []),
    {
      kind: "data",
      key: "documents",
      surface: ({
        kind: "table",
        framed: true,

        rows: documents,
        columns,
        visibleColumns: columns.map((column) => column.key),
        rowKey: (document) => document.id,
        onRowClick: (document) => setDetailId(document.id),
        loading,
        emptyText: loading ? "加载中..." : "暂无资料",
      } satisfies DataSurfaceProps<LibraryDocumentItem>) as DataSurfaceProps,
    },
  ];

  return (
    <>
      <PageSurface kind="standard"
        toolbar={{ items: toolbarItems }}
        body={{
          kind: "split",
          left: { sections: createPageBody(sideBlocks).sections },
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
          canWrite={canWrite}
          canDelete={canDelete}
          canAdmin={canAdmin}
        />
      )}

      {showGenerate && (
        <GenerateDocumentModal onClose={() => setShowGenerate(false)} onSuccess={handleUpdated} />
      )}
    </>
  );
}
