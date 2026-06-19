"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@workspace/core/ui";
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
  const columns: DataTableColumn<LibraryDocumentItem>[] = [
    {
      key: "fileName",
      label: "文件名",
      required: true,
      render: (d) => (
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
      cellClassName: "text-gray-500",
      render: (d) => (
        <span className="block max-w-[12rem] truncate" title={d.summary || ""}>
          {d.summary || "—"}
        </span>
      ),
    },
    { key: "updatedAt", label: "更新时间", defaultVisible: true, cellClassName: "text-gray-500", render: (d) => fmtDate(d.updatedAt) },
    {
      key: "tags",
      label: "标签",
      defaultVisible: true,
      render: (d) => d.tags && d.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {d.tags.map((tag) => (
            <span key={tag} className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
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
      render: (d) => d.status === "active" ? (
        <a
          href={`/api/library/documents/${d.id}/download`}
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

  if (loading) {
    return <div className="py-16 text-center text-gray-400">加载中…</div>;
  }

  if (documents.length === 0) {
    return <div className="py-16 text-center text-gray-400">暂无资料</div>;
  }

  return (
    <>
      <div className="rounded-lg bg-white shadow-sm overflow-hidden">
        <DataTable
          rows={documents}
          columns={columns}
          visibleColumns={columns.map((column) => column.key)}
          rowKey={(document) => document.id}
          onRowClick={(document) => setDetailId(document.id)}
        />
      </div>
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
