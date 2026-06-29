"use client";

import { useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createPageBody, createPageTableBlock, PageSurface } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";
import LibraryDetailModal from "./LibraryDetailModal";

interface Props {
  documents: LibraryDocumentItem[];
  loading: boolean;
  onRefresh: () => void;
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LibraryTable({
  documents,
  loading,
  onRefresh,
  canWrite,
  canDelete,
  canAdmin,
}: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const columns: DataSurfaceColumnSpec<LibraryDocumentItem>[] = [
    {
      key: "fileName",
      label: "文件名",
      required: true,
      cell: (d) => (
        <div>
          <div className="max-w-xs truncate font-medium text-gray-800">{d.fileName}</div>
          {d.title && d.title !== d.fileName && (
            <div className="max-w-xs truncate text-xs text-gray-400">{d.title}</div>
          )}
          {d.docId && (
            <div className="max-w-xs truncate text-xs font-medium text-emerald-600">{d.docId}</div>
          )}
        </div>
      ),
    },
    {
      key: "summary",
      label: "简介",
      defaultVisible: true,
      tone: "muted",
      cell: (d) => (
        <span className="block max-w-48 truncate" title={d.summary || ""}>
          {d.summary || "—"}
        </span>
      ),
    },
    { key: "updatedAt", label: "更新时间", defaultVisible: true, tone: "muted", cell: (d) => fmtDate(d.updatedAt) },
    {
      key: "tags",
      label: "标签",
      defaultVisible: true,
      cell: (d) => d.tags && d.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {d.tags.map((tag) => (
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
      cell: (d) => d.status === "active" ? (
        <a
          href={workspacePath(`/api/modules/library/basic-info/documents/${d.id}/download`)}
          className="inline-flex items-center text-emerald-600 hover:text-emerald-700"
          title="下载"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </a>
      ) : null,
    },
  ];

  return (
    <>
      <PageSurface
        kind="list"
        embedded
        body={createPageBody([
          createPageTableBlock<LibraryDocumentItem>("library-documents", {
            framed: true,

            rows: documents,
            columns,
            visibleColumns: columns.map((column) => column.key),
            rowKey: (document) => document.id,
            onRowClick: (document) => setDetailId(document.id),
            loading,
            emptyText: loading ? "加载中..." : "暂无资料",
          }),
        ])}
      />
      {detailId !== null && (
        <LibraryDetailModal
          documentId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={onRefresh}
          canWrite={canWrite}
          canDelete={canDelete}
          canAdmin={canAdmin}
        />
      )}
    </>
  );
}
