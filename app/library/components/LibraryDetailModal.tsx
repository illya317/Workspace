"use client";

import { useState, useEffect } from "react";
import DetailModal from "@/app/components/DetailModal";
import EditToolbar from "@/app/components/EditToolbar";
import { useToast } from "@/app/hooks/useToast";
import Toast from "@/app/components/Toast";
import { useDocumentDetail, updateDocument } from "../hooks/useLibraryDocuments";
import type { LibraryDocumentItem } from "../types";

interface Props {
  documentId: number;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "正常" },
  { value: "missing", label: "缺失" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" },
];

const CONFIDENTIALITY_OPTIONS = [
  { value: 0, label: "公开" },
  { value: 1, label: "内部" },
  { value: 2, label: "普通" },
  { value: 3, label: "机密" },
  { value: 4, label: "绝密" },
];

function fmtSize(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function LibraryDetailModal({ documentId, onClose, onUpdated }: Props) {
  const { doc, loading, setDoc } = useDocumentDetail(documentId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<LibraryDocumentItem>>({});
  const { toast, showToast, closeToast } = useToast();

  useEffect(() => {
    if (doc) setForm({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (form.title !== undefined) payload.title = form.title;
      if (form.summary !== undefined) payload.summary = form.summary;
      if (form.categoryCode !== undefined) payload.categoryCode = form.categoryCode;
      if (form.categoryName !== undefined) payload.categoryName = form.categoryName;
      if (form.confidentialityLevel !== undefined) payload.confidentialityLevel = form.confidentialityLevel;
      if (form.status !== undefined) payload.status = form.status;
      const updated = await updateDocument(doc.id, payload);
      setDoc(updated);
      showToast("保存成功", "success");
      setEditing(false);
      onUpdated();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({});
    setEditing(false);
  };

  const renderField = (label: string, value: React.ReactNode) => (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 block mb-0.5">{label}</span>
      <div className="text-sm text-gray-800">{value}</div>
    </div>
  );

  return (
    <>
      <Toast
        show={!!toast}
        message={toast?.message || ""}
        type={toast?.type}
        onClose={closeToast}
      />
      <DetailModal open={true} title={doc?.title || doc?.fileName || "资料详情"} onClose={onClose}>
        <div className="max-w-lg mx-auto">
          <EditToolbar
            editMode={editing}
            onStartEdit={() => setEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={saving}
          />

          {loading || !doc ? (
            <div className="py-12 text-center text-gray-400">加载中…</div>
          ) : (
            <div className="mt-4 space-y-1">
              {editing ? (
                <>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">标题</label>
                    <input
                      type="text"
                      value={form.title ?? doc.title ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">简介</label>
                    <textarea
                      value={form.summary ?? doc.summary ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                      rows={3}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">分类编码</label>
                    <input
                      type="text"
                      value={form.categoryCode ?? doc.categoryCode ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">分类名称</label>
                    <input
                      type="text"
                      value={form.categoryName ?? doc.categoryName ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, categoryName: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">保密等级</label>
                    <select
                      value={form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel}
                      onChange={(e) => setForm((f) => ({ ...f, confidentialityLevel: parseInt(e.target.value, 10) }))}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {CONFIDENTIALITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="py-2">
                    <label className="text-xs text-gray-400 block mb-1">状态</label>
                    <select
                      value={form.status !== undefined ? form.status : doc.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {renderField("文件名", doc.fileName)}
                  {renderField("标题", doc.title || "—")}
                  {renderField("简介", doc.summary || "—")}
                  {renderField("分类", `${doc.categoryCode || "—"} ${doc.categoryName || ""}`)}
                  {renderField("路径", doc.subcategoryPath || "—")}
                  {renderField("大小", fmtSize(doc.fileSizeBytes))}
                  {renderField("保密等级", CONFIDENTIALITY_OPTIONS.find((o) => o.value === doc.confidentialityLevel)?.label || `L${doc.confidentialityLevel}`)}
                  {renderField("状态", STATUS_OPTIONS.find((o) => o.value === doc.status)?.label || doc.status)}
                  {renderField("来源", doc.origin)}
                  {renderField("版本", `v${doc.version}`)}
                  {renderField("更新时间", fmtDate(doc.updatedAt))}
                  {doc.relativePath && doc.status === "active" && (
                    <div className="py-2 border-b border-gray-100 last:border-0">
                      <span className="text-xs text-gray-400 block mb-0.5">下载</span>
                      <a
                        href={`/api/library/${encodeURIComponent(doc.relativePath)}`}
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        下载文件
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </DetailModal>
    </>
  );
}
