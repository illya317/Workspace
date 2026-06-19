"use client";

import { useState, useEffect } from "react";
import { ActionButton, ConfirmModal, DetailModal, EditToolbar, Toast } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { useDocumentDetail, updateDocument, deleteDocument } from "../hooks/useLibraryDocuments";
import LibraryEditForm from "./LibraryEditForm";
import type { LibraryDocumentItem } from "@workspace/library/types";

interface Props {
  documentId: number;
  onClose: () => void;
  onUpdated: () => void;
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
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

export default function LibraryDetailModal({
  documentId,
  onClose,
  onUpdated,
  canWrite,
  canDelete,
  canAdmin,
}: Props) {
  const { doc, loading, setDoc } = useDocumentDetail(documentId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [form, setForm] = useState<Partial<LibraryDocumentItem>>({});
  const { toast, showToast, closeToast } = useToast();

  const canEdit = canWrite || canAdmin;

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

  const handleDelete = async () => {
    if (!doc) return;
    setDeleting(true);
    try {
      await deleteDocument(doc.id);
      showToast("已删除", "success");
      setShowDeleteConfirm(false);
      onUpdated();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  const renderField = (label: string, value: React.ReactNode) => (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 block mb-0.5">{label}</span>
      <div className="text-sm text-gray-800">{value}</div>
    </div>
  );

  return (
    <>
      <Toast show={!!toast} message={toast?.message || ""} type={toast?.type} onClose={closeToast} />
      <DetailModal open={true} title={doc?.title || doc?.fileName || "资料详情"} onClose={onClose}>
        <div className="max-w-lg mx-auto">
          {canEdit && (
            <EditToolbar
              editMode={editing}
              onStartEdit={() => setEditing(true)}
              onSave={handleSave}
              onCancel={handleCancel}
              saving={saving}
            />
          )}

          {loading || !doc ? (
            <div className="py-12 text-center text-gray-400">加载中…</div>
          ) : (
            <div className="mt-4 space-y-1">
              {editing ? (
                <LibraryEditForm
                  doc={doc}
                  form={form}
                  setForm={setForm}
                  canWrite={canWrite}
                  canAdmin={canAdmin}
                />
              ) : (
                <>
                  {renderField("文档编号", doc.docId || "—")}
                  {renderField("文件名", doc.fileName)}
                  {renderField("标题", doc.title || "—")}
                  {renderField("简介", doc.summary || "—")}
                  {renderField("标签", doc.tags?.length ? <div className="flex flex-wrap gap-1">{doc.tags.map((t) => <span key={t} className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{t}</span>)}</div> : "—")}
                  {renderField("分类", `${doc.categoryCode || "—"} ${doc.categoryName || ""}`)}
                  {renderField("目录", doc.directoryPath || "—")}
                  {renderField("大小", fmtSize(doc.fileSizeBytes))}
                  {renderField("保密等级", CONFIDENTIALITY_OPTIONS.find((o) => o.value === doc.confidentialityLevel)?.label || `L${doc.confidentialityLevel}`)}
                  {renderField("状态", STATUS_OPTIONS.find((o) => o.value === doc.status)?.label || doc.status)}
                  {renderField("来源", doc.origin)}
                  {renderField("版本", `v${doc.version}`)}
                  {renderField("更新时间", fmtDate(doc.updatedAt))}
                  {doc.status === "active" && (
                    <div className="py-2 border-b border-gray-100 last:border-0">
                      <span className="text-xs text-gray-400 block mb-0.5">下载</span>
                      <a
                        href={`/api/library/documents/${doc.id}/download`}
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                        target="_blank" rel="noopener noreferrer"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        下载文件
                      </a>
                    </div>
                  )}
                  {canDelete && (
                    <div className="pt-4">
                      <ActionButton onClick={() => setShowDeleteConfirm(true)} variant="danger">
                        删除
                      </ActionButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </DetailModal>

      <ConfirmModal
        open={showDeleteConfirm}
        title="确认删除"
        message={`确定要删除 "${doc?.fileName || "此文件"}" 吗？删除后将归档，不会永久丢失。`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmLabel={deleting ? "删除中..." : "确认删除"}
      />
    </>
  );
}
