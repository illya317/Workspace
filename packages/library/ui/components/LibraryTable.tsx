"use client";

import { useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { BodySurface, createPageBody, createPageTableSection, PageSurface } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";
import LibraryDetailModal from "./LibraryDetailModal";

interface Props {
  documents: LibraryDocumentItem[];
  loading: boolean;
  onRefresh: () => void;
  canWrite?: boolean;
  canArchive?: boolean;
  canExport?: boolean;
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
  canArchive,
  canExport,
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
      cell: (d) => canExport && d.status === "active" ? (
        <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
          <BodySurface
            kind="section"
            commands={[{
              key: "download",
              label: "下载",
              icon: "download",
              onClick: () => window.open(workspacePath(`/api/modules/library/basic-info/documents/${d.id}/download`), "_blank", "noopener,noreferrer"),
              presentation: "icon",
              size: "sm",
            }]}
          />
        </span>
      ) : null,
    },
  ];

  return (
    <>
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          createPageTableSection<LibraryDocumentItem>("library-documents", {

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
          canArchive={canArchive}
          canExport={canExport}
          canAdmin={canAdmin}
        />
      )}
    </>
  );
}
