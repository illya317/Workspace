"use client";

import { useState, useEffect } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createPageBody, createPageModalSection, BodySurface, useFeedback } from "@workspace/core/ui";
import type { FormSurfaceActionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import { archiveDocument, useDocumentDetail, updateDocument } from "../hooks/useLibraryDocuments";
import type { LibraryDocumentItem } from "@workspace/library/types";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS,
  LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_OPTIONS,
} from "./library-document-options";
interface Props {
  documentId: number;
  onClose: () => void;
  onUpdated: () => void;
  canUpdate?: boolean;
  canArchive?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
}
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
  canUpdate,
  canArchive,
  canExport,
  canConfigure
}: Props) {
  const {
    doc,
    loading,
    setDoc
  } = useDocumentDetail(documentId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [form, setForm] = useState<Partial<LibraryDocumentItem>>({});
  const feedback = useFeedback();
  const canEdit = canUpdate || canConfigure;
  useEffect(() => {
    setForm({});
  }, [documentId]);
  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (form.title !== undefined) payload.title = form.title;
      if (form.summary !== undefined) payload.summary = form.summary;
      if (form.tags !== undefined) payload.tags = form.tags;
      if (form.categoryCode !== undefined) payload.categoryCode = form.categoryCode;
      if (form.categoryName !== undefined) payload.categoryName = form.categoryName;
      if (form.confidentialityLevel !== undefined) payload.confidentialityLevel = form.confidentialityLevel;
      if (form.status !== undefined) payload.status = form.status;
      const updated = await updateDocument(doc.id, payload);
      setDoc(updated);
      feedback.success("保存成功");
      setEditing(false);
      onUpdated();
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const handleCancel = () => {
    setForm({});
    setEditing(false);
  };
  const handleArchive = async () => {
    if (!doc) return;
    const ok = await feedback.confirmDelete({
      message: `确定要归档 "${doc.fileName || "此文件"}" 吗？归档后不会永久丢失。`,
      confirmLabel: archiving ? "归档中..." : "确认归档",
    });
    if (!ok) return;
    setArchiving(true);
    try {
      await archiveDocument(doc.id);
      feedback.success("已归档");
      onUpdated();
      onClose();
    } catch (e) {
      feedback.error(e instanceof Error ? e.message : "归档失败");
    } finally {
      setArchiving(false);
    }
  };

  const readonlySpec = { valueType: "string" as const, control: "text" as const, state: "readonly" as const };
  const editableState = !canUpdate ? "disabled" as const : "normal" as const;
  const fields: FormSurfaceFieldSpec[] = !doc
    ? [{
        key: "loading",
        label: "状态",
        spec: readonlySpec,
        value: loading ? "加载中..." : "暂无资料",
      }]
    : editing
      ? [
          {
            key: "title",
            label: "标题",
            spec: { valueType: "string", control: "text", state: editableState },
            value: form.title ?? doc.title ?? "",
            onChange: (value) => setForm((current) => ({ ...current, title: String(value ?? "") })),
          },
          {
            key: "summary",
            label: "简介",
            spec: { valueType: "string", control: "text", multiline: true, state: editableState },
            value: form.summary ?? doc.summary ?? "",
            onChange: (value) => setForm((current) => ({ ...current, summary: String(value ?? "") })),
            rows: 3,
          },
          {
            key: "tags",
            label: "标签（用逗号分隔）",
            spec: { valueType: "string", control: "text", state: editableState },
            value: (form.tags !== undefined ? form.tags : (doc.tags ?? [])).join(", "),
            onChange: (value) => {
              const tags = String(value ?? "")
                .split(/[,，]/)
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);
              setForm((current) => ({ ...current, tags }));
            },
            placeholder: "如 年度报表, 已审计, 研发",
          },
          {
            key: "categoryCode",
            label: "分类编码",
            spec: { valueType: "string", control: "text", state: editableState },
            value: form.categoryCode ?? doc.categoryCode ?? "",
            onChange: (value) => setForm((current) => ({ ...current, categoryCode: String(value ?? "") })),
          },
          {
            key: "categoryName",
            label: "分类名称",
            spec: { valueType: "string", control: "text", state: editableState },
            value: form.categoryName ?? doc.categoryName ?? "",
            onChange: (value) => setForm((current) => ({ ...current, categoryName: String(value ?? "") })),
          },
          {
            key: "confidentialityLevel",
            label: "保密等级",
            hint: !canConfigure ? "需要配置权限才能修改保密等级" : undefined,
            spec: {
              valueType: "number",
              control: "choice",
              state: !canConfigure ? "disabled" : "normal",
              options: {
                source: "static",
                items: LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS,
              },
            },
            value: String(form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel),
            onChange: (value) => setForm((current) => ({ ...current, confidentialityLevel: parseInt(String(value), 10) })),
          },
        ]
      : [
          { key: "docId", label: "文档编号", spec: readonlySpec, value: doc.docId || "—" },
          { key: "fileName", label: "文件名", spec: readonlySpec, value: doc.fileName },
          { key: "title", label: "标题", spec: readonlySpec, value: doc.title || "—" },
          { key: "summary", label: "简介", spec: { ...readonlySpec, control: "text", multiline: true }, value: doc.summary || "—", rows: 3 },
          { key: "tags", label: "标签", spec: readonlySpec, value: doc.tags?.length ? doc.tags.join(", ") : "—" },
          { key: "category", label: "分类", spec: readonlySpec, value: `${doc.categoryCode || "—"} ${doc.categoryName || ""}` },
          { key: "directory", label: "目录", spec: readonlySpec, value: doc.directoryPath || "—" },
          { key: "size", label: "大小", spec: readonlySpec, value: fmtSize(doc.fileSizeBytes) },
          {
            key: "confidentialityLevel",
            label: "保密等级",
            spec: readonlySpec,
            value: LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS.find((option) => option.value === doc.confidentialityLevel)?.label || `L${doc.confidentialityLevel}`,
          },
          { key: "status", label: "状态", spec: readonlySpec, value: LIBRARY_DOCUMENT_STATUS_OPTIONS.find((option) => option.value === doc.status)?.label || doc.status },
          { key: "origin", label: "来源", spec: readonlySpec, value: doc.origin },
          { key: "version", label: "版本", spec: readonlySpec, value: `v${doc.version}` },
          { key: "updatedAt", label: "更新时间", spec: readonlySpec, value: fmtDate(doc.updatedAt) },
        ];

  const actions: FormSurfaceActionSpec[] = [];
  if (doc && canEdit) {
    if (editing) {
      actions.push({ key: "cancel", action: "cancel", label: "取消", onClick: handleCancel });
      actions.push({ key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving, onClick: () => void handleSave() });
    } else {
      actions.push({ key: "edit", action: "edit", label: "编辑", onClick: () => setEditing(true) });
    }
  }
  if (doc && !editing && canExport && doc.status === "active") {
    actions.push({
      key: "download",
      action: "download",
      label: "下载文件",
      onClick: () => window.open(workspacePath(`/api/modules/library/basic-info/documents/${doc.id}/download`), "_blank", "noopener,noreferrer"),
    });
  }
  if (doc && !editing && canArchive) {
    actions.push({ key: "archive", action: "archive", label: archiving ? "归档中..." : "归档", disabled: archiving, onClick: () => void handleArchive() });
  }

  return (
    <BodySurface {...createPageBody([
        createPageModalSection("library-detail", {
          open: true,
          title: doc?.title || doc?.fileName || "资料详情",
          onClose,

          sections: [
            createFieldsSection("library-detail-form", fields, {
              actions,
            }),
          ],
        }),
      ])} />
  );
}
