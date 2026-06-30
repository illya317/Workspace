"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPageBody,
  createPageTabsNavigation,
  PageSurface,
  type BodySurfaceCommandSpec,
} from "@workspace/core/ui";
import {
  createEmptyEditorDocument,
  exportEditorDocumentToDocxBlob,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import {
  copyEditorTemplate,
  fetchEditorBootstrap,
  fetchEditorTemplate,
  markEditorTemplatePublished,
  requestEditorTemplatePublish,
  saveEditorTemplateDraft,
  type EditorSpaceDto,
  type EditorTemplateDetailDto,
} from "./api";
import { createEditorDetailSection } from "./sections";
import {
  canEdit,
  canManage,
  evaluateFieldModel,
  fieldRows,
  isEditableSpace,
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
  const router = useRouter();
  const [spaces, setSpaces] = useState<EditorSpaceDto[]>([]);
  const [activeTab, setActiveTab] = useState("paper");
  const [detail, setDetail] = useState<EditorTemplateDetailDto | null>(null);
  const [documentDraft, setDocumentDraft] = useState<EditorDocument>(() => createEmptyEditorDocument());
  const [fieldModelDraft, setFieldModelDraft] = useState<FieldModel>(() => ({ schemaVersion: 1, fields: {}, formulas: {} }));
  const [detailLoading, setDetailLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSpaces = useCallback(async () => {
    try {
      const data = await fetchEditorBootstrap();
      setSpaces(data.spaces);
    } catch {
      setSpaces([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setMessage(null);
    Promise.all([fetchEditorTemplate(templateId), loadSpaces()])
      .then(([next]) => {
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
  }, [loadSpaces, templateId]);

  const editableTargetSpace = spaces.find(isEditableSpace) ?? null;
  const formulaComputation = useMemo(() => evaluateFieldModel(fieldModelDraft), [fieldModelDraft]);
  const formulaRows = useMemo(() => fieldRows(fieldModelDraft, formulaComputation), [fieldModelDraft, formulaComputation]);

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
      await loadSpaces();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function copyTemplate() {
    if (!detail) return;
    if (!editableTargetSpace) {
      setMessage("没有可写入的模板空间");
      return;
    }
    setBusy("copy");
    setMessage(null);
    try {
      const copied = await copyEditorTemplate(detail.id, {
        targetSpaceId: editableTargetSpace.id,
        title: `${detail.title} 副本`,
      });
      setMessage("模板已复制");
      router.push(`/docs/editor/templates/${encodeURIComponent(copied.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishRequest() {
    if (!detail) return;
    setBusy("publish-request");
    setMessage(null);
    try {
      const next = await requestEditorTemplatePublish(detail.id);
      setDetail(next);
      setMessage("已提交发布申请");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交发布失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishOfficial() {
    if (!detail) return;
    setBusy("publish");
    setMessage(null);
    try {
      const next = await markEditorTemplatePublished(detail.id, { official: detail.sourceKind?.includes("qc") });
      setDetail(next);
      setMessage("模板已发布");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败");
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

  const detailActions: BodySurfaceCommandSpec[] = [
    {
      key: "save",
      label: "保存草稿",
      variant: "primary",
      onClick: saveDraft,
      disabled: !detail || busy === "save" || !canEdit(detail.role),
    },
    {
      key: "copy",
      label: "复制模板",
      onClick: copyTemplate,
      disabled: !detail || busy === "copy" || !editableTargetSpace,
    },
    {
      key: "export",
      label: "导出 DOCX",
      onClick: exportDocx,
      disabled: !detail || busy === "export",
    },
    {
      key: "request-publish",
      label: "申请发布",
      onClick: publishRequest,
      disabled: !detail || detail.status !== "draft" || busy === "publish-request" || !canEdit(detail.role),
    },
    {
      key: "mark-published",
      label: "标记发布",
      variant: "primary",
      onClick: publishOfficial,
      disabled: !detail || busy === "publish" || !canManage(detail.role),
    },
  ];

  return (
    <PageSurface
      kind="standard"
      navigation={createPageTabsNavigation({
        items: [
          { key: "paper", label: "纸面编辑" },
          { key: "fields", label: "字段/公式" },
        ],
        active: activeTab,
        onChange: setActiveTab,
        ariaLabel: "模板编辑器视图",
      })}
      body={createPageBody([
        createEditorDetailSection({
          activeTab,
          detail,
          detailActions,
          detailLoading,
          documentDraft,
          fieldModelDraft,
          formulaRows,
          formulaComputation,
          message,
          selectedTemplate: detail,
          setFieldModelDraft,
          setDocumentDraft,
        }),
      ])}
    />
  );
}
