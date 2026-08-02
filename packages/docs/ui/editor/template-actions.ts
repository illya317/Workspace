"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  exportEditorDocumentToDocxBlob,
  type EditorDocument,
} from "@workspace/platform/document-editor";
import {
  archiveEditorTemplate,
  deleteEditorTemplateDraft,
  type EditorTemplateDetailDto,
  type EditorTemplateListItemDto,
} from "./api";
import { downloadBlob } from "./workbench-navigation";

type DocsEditorTemplateActionsInput = {
  detail: EditorTemplateDetailDto | null;
  documentDraft: EditorDocument;
  formulaPreviewValues: Record<string, unknown>;
  canDeleteTemplate: boolean;
  canArchiveTemplate: boolean;
  canExportTemplate: boolean;
  confirmDelete: (input: { message: string }) => Promise<boolean>;
  confirmArchive: (input: { title: string; message: string; confirmLabel: string; confirmDanger: boolean }) => Promise<boolean>;
  setActiveTemplateId: Dispatch<SetStateAction<string | null>>;
  setBusy: Dispatch<SetStateAction<string | null>>;
  setDetail: Dispatch<SetStateAction<EditorTemplateDetailDto | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setTemplates: Dispatch<SetStateAction<EditorTemplateListItemDto[]>>;
};

export function createDocsEditorTemplateActions(input: DocsEditorTemplateActionsInput) {
  return {
    deleteTemplate: () => deleteTemplate(input),
    archiveTemplate: () => archiveTemplate(input),
    exportDocx: () => exportDocx(input),
  };
}

async function deleteTemplate(input: DocsEditorTemplateActionsInput) {
  if (!input.detail) return;
  if (!input.canDeleteTemplate) {
    input.setMessage("当前模板无删除权限");
    return;
  }
  const currentDetail = input.detail;
  const ok = await input.confirmDelete({
    message: `确定删除「${currentDetail.title}」吗？此操作不可撤销。`,
  });
  if (!ok) return;
  input.setBusy("delete");
  input.setMessage(null);
  try {
    await deleteEditorTemplateDraft(currentDetail.id, { version: currentDetail.version });
    input.setDetail(null);
    input.setTemplates((current) => {
      const next = current.filter((template) => template.id !== currentDetail.id);
      input.setActiveTemplateId(next[0]?.id ?? null);
      return next;
    });
    input.setMessage("模板已删除");
  } catch (error) {
    input.setMessage(error instanceof Error ? error.message : "删除失败");
  } finally {
    input.setBusy(null);
  }
}

async function archiveTemplate(input: DocsEditorTemplateActionsInput) {
  if (!input.detail) return;
  if (!input.canArchiveTemplate) {
    input.setMessage("当前模板无归档权限");
    return;
  }
  const currentDetail = input.detail;
  const ok = await input.confirmArchive({
    title: "确认归档",
    message: `确定归档「${currentDetail.title}」吗？`,
    confirmLabel: "归档",
    confirmDanger: true,
  });
  if (!ok) return;
  input.setBusy("archive");
  input.setMessage(null);
  try {
    const saved = await archiveEditorTemplate(currentDetail.id, { version: currentDetail.version });
    input.setDetail(saved);
    input.setTemplates((current) => current.map((template) => template.id === saved.id ? saved : template));
    input.setMessage("模板已归档");
  } catch (error) {
    input.setMessage(error instanceof Error ? error.message : "归档失败");
  } finally {
    input.setBusy(null);
  }
}

async function exportDocx(input: DocsEditorTemplateActionsInput) {
  if (!input.canExportTemplate) {
    input.setMessage("当前模板无导出权限");
    return;
  }
  input.setBusy("export");
  input.setMessage(null);
  try {
    const blob = await exportEditorDocumentToDocxBlob(input.documentDraft, input.formulaPreviewValues);
    downloadBlob(blob, `${input.detail?.title ?? input.documentDraft.title}.docx`);
    input.setMessage("DOCX 已生成");
  } catch (error) {
    input.setMessage(error instanceof Error ? error.message : "导出 DOCX 失败");
  } finally {
    input.setBusy(null);
  }
}
