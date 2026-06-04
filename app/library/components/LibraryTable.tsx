"use client";

import { useState } from "react";
import type { LibraryDocumentItem } from "../types";
import LibraryDetailModal from "./LibraryDetailModal";

interface Props {
  documents: LibraryDocumentItem[];
  loading: boolean;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  missing: "缺失",
  archived: "归档",
  draft: "草稿",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  missing: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-600",
  draft: "bg-yellow-100 text-yellow-700",
};

function fmtSize(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function confidentialityLabel(level: number) {
  const map: Record<number, string> = { 0: "公开", 1: "内部", 2: "普通", 3: "机密", 4: "绝密" };
  return map[level] || `L${level}`;
}

function confidentialityStyle(level: number) {
  if (level <= 1) return "bg-blue-100 text-blue-700";
  if (level === 2) return "bg-green-100 text-green-700";
  if (level === 3) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

export default function LibraryTable({ documents, loading, onRefresh }: Props) {
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">标题</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">分类</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">更新时间</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">版本</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">大小</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">保密</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">状态</th>
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
                  <div className="font-medium text-gray-800">{d.title || d.fileName}</div>
                  {d.summary && <div className="text-xs text-gray-400 truncate max-w-xs">{d.summary}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{d.categoryName || d.categoryCode || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(d.updatedAt)}</td>
                <td className="px-4 py-3 text-gray-500">v{d.version}</td>
                <td className="px-4 py-3 text-gray-500">{fmtSize(d.fileSizeBytes)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${confidentialityStyle(d.confidentialityLevel)}`}>
                    {confidentialityLabel(d.confidentialityLevel)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] || "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[d.status] || d.status}
                  </span>
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
        />
      )}
    </>
  );
}
