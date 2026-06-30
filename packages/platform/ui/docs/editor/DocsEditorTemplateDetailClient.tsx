"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  PageSurface,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import {
  createEmptyEditorDocument,
  exportEditorDocumentToDocxBlob,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import {
  fetchEditorTemplate,
  saveEditorTemplateDraft,
  type EditorTemplateDetailDto,
} from "./api";
import { createEditorDetailSection } from "./sections";
import {
  canEdit,
  evaluateFieldModel,
  normalizeEditorDocument,
  normalizeFieldModel,
} from "./model";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DocsEditorTemplateDetailClient({ templateId }: { templateId: string }) {
  const [detail, setDetail] = useState<EditorTemplateDetailDto | null>(null);
  const [documentDraft, setDocumentDraft] = useState<EditorDocument>(() => createEmptyEditorDocument());
  const [fieldModelDraft, setFieldModelDraft] = useState<FieldModel>(() => ({ schemaVersion: 1, fields: {}, formulas: {} }));
  const [detailLoading, setDetailLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setMessage(null);
    fetchEditorTemplate(templateId)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setDocumentDraft(normalizeEditorDocument(next));
        setFieldModelDraft(normalizeFieldModel(next.fieldModel));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "加载模板详情失败");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const formulaComputation = useMemo(() => evaluateFieldModel(fieldModelDraft), [fieldModelDraft]);

  async function saveDraft() {
    if (!detail) return;
    setBusy("save");
    setMessage(null);
    try {
      const saved = await saveEditorTemplateDraft(detail.id, {
        title: detail.title,
        document: documentDraft,
        fieldModel: fieldModelDraft,
      });
      setDetail(saved);
      setDocumentDraft(normalizeEditorDocument(saved));
      setFieldModelDraft(normalizeFieldModel(saved.fieldModel));
      setMessage("草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function exportDocx() {
    setBusy("export");
    setMessage(null);
    try {
      const blob = await exportEditorDocumentToDocxBlob(documentDraft, formulaComputation.previewValues);
      downloadBlob(blob, `${detail?.title ?? documentDraft.title}.docx`);
      setMessage("DOCX 已生成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出 DOCX 失败");
    } finally {
      setBusy(null);
    }
  }

  const saveToolbarItem: SurfaceToolbarItems[number] = {
    kind: "icon-button",
    key: "save",
    icon: "save",
    label: "保存草稿",
    section: "edit",
    variant: "primary",
    onClick: saveDraft,
    disabled: !detail || busy === "save" || !canEdit(detail.role),
  };

  const paperToolbarItems: SurfaceToolbarItems = [
    saveToolbarItem,
    {
      kind: "icon-button",
      key: "export",
      icon: "download",
      label: "导出 DOCX",
      section: "action",
      onClick: exportDocx,
      disabled: !detail || busy === "export",
    },
  ];

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: paperToolbarItems }}
      body={createPageBody([
        createEditorDetailSection({
          detail,
          detailLoading,
          documentDraft,
          fieldModelDraft,
          formulaComputation,
          message,
          setDocumentDraft,
        }),
      ])}
    />
  );
}
