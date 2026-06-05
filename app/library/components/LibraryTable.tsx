"use client";

import { useState } from "react";
import type { LibraryDocumentItem } from "../types";
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

  if (loading) {
    return <div className="py-16 text-center text-gray-400">加载中…</div>;
  }

  if (documents.length === 0) {
    return <div className="py-16 text-center text-gray-400">暂无资料</div>;
  }

  return (
    <>
      <div className="rounded-lg bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">文件名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-48">简介</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">更新时间</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">标签</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-16">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((d) => (
              <tr
                key={d.id}
                onClick={() => setDetailId(d.id)}
                className="hover:bg-gray-50 cursor-pointer transition"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 truncate max-w-xs">{d.fileName}</div>
                  {d.title && d.title !== d.fileName && (
                    <div className="text-xs text-gray-400 truncate max-w-xs">{d.title}</div>
                  )}
                  {d.docId && (
                    <div className="text-xs text-emerald-600 font-medium truncate max-w-xs">{d.docId}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  <span className="truncate max-w-[12rem] block" title={d.summary || ""}>
                    {d.summary || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(d.updatedAt)}</td>
                <td className="px-4 py-3">
                  {d.tags && d.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {d.tags.map((tag) => (
                        <span key={tag} className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {d.status === "active" && (
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
