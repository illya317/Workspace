"use client";

import {
  createEmptySection,
  createMessageSection,
  createSectionSection,
  createStatusSection,
  type BodySurfaceCommandSpec,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import {
  DocumentEditorCanvas,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import type {
  EditorTemplateDetailDto,
  EditorTemplateListItemDto,
} from "./api";
import { FormulaWorkbench } from "./FormulaWorkbench";
import {
  addFormulaField,
  canEdit,
  roleLabel,
  statusLabel,
  upsertFormula,
  type FieldFormulaRow,
  type FormulaComputation,
} from "./model";

export function createEditorDetailSection(input: {
  activeTab: string;
  detail: EditorTemplateDetailDto | null;
  detailActions: BodySurfaceCommandSpec[];
  detailLoading: boolean;
  documentDraft: EditorDocument;
  fieldModelDraft: FieldModel;
  formulaRows: FieldFormulaRow[];
  formulaComputation: FormulaComputation;
  message: string | null;
  selectedTemplate: EditorTemplateListItemDto | null;
  setFieldModelDraft: (updater: (current: FieldModel) => FieldModel) => void;
  setDocumentDraft: (document: EditorDocument) => void;
}): BodySurfaceSectionSpec {
  const {
    activeTab,
    detail,
    detailActions,
    detailLoading,
    documentDraft,
    fieldModelDraft,
    formulaRows,
    formulaComputation,
    message,
    selectedTemplate,
    setFieldModelDraft,
    setDocumentDraft,
  } = input;

  if (detailLoading) {
    return createSectionSection("docs-editor-detail", {
      title: selectedTemplate?.title ?? "模板详情",
      actions: detailActions,
      sections: [createStatusSection("detail-loading", { kind: "loading", content: "加载模板详情..." })],
    });
  }

  if (!detail) {
    return createSectionSection("docs-editor-detail", {
      title: "模板详情",
      sections: [createEmptySection("detail-empty", { content: "请选择一个模板", compact: true })],
    });
  }

  const messageSection = message
    ? [createMessageSection("docs-editor-message", { content: message, tone: message.includes("失败") ? "danger" : "success" })]
    : [];

  if (activeTab === "fields") {
    return createFieldsTabSection({
      detail,
      detailActions,
      formulaRows,
      formulaComputation,
      messageSection,
      setFieldModelDraft,
    });
  }

  return createPaperTabSection({
    detail,
    detailActions,
    documentDraft,
    fieldModelDraft,
    formulaRows,
    formulaComputation,
    messageSection,
    setDocumentDraft,
  });
}

function createFieldsTabSection(input: {
  detail: EditorTemplateDetailDto;
  detailActions: BodySurfaceCommandSpec[];
  formulaRows: FieldFormulaRow[];
  formulaComputation: FormulaComputation;
  messageSection: BodySurfaceSectionSpec[];
  setFieldModelDraft: (updater: (current: FieldModel) => FieldModel) => void;
}) {
  const { detail, detailActions, formulaRows, formulaComputation, messageSection, setFieldModelDraft } = input;
  return createSectionSection("docs-editor-fields", {
    title: "字段/公式",
    subtitle: `${formulaRows.length} 个字段，公式以字段 key 为稳定引用。${formulaComputation.errorCount ? ` ${formulaComputation.errorCount} 个公式缺少输入或待处理。` : ""}`,
    sections: [
      ...messageSection,
      createEmptySection("formula-workbench", {
        presentation: "plain",
        content: (
          <FormulaWorkbench
            actions={detailActions}
            canEdit={canEdit(detail.role)}
            formulaComputation={formulaComputation}
            rows={formulaRows}
            onAddFormula={() => setFieldModelDraft(addFormulaField)}
            onChangeFormula={(key, formula) => setFieldModelDraft((current) => upsertFormula(current, key, formula))}
          />
        ),
      }),
    ],
  });
}

function createPaperTabSection(input: {
  detail: EditorTemplateDetailDto;
  detailActions: BodySurfaceCommandSpec[];
  documentDraft: EditorDocument;
  fieldModelDraft: FieldModel;
  formulaRows: FieldFormulaRow[];
  formulaComputation: FormulaComputation;
  messageSection: BodySurfaceSectionSpec[];
  setDocumentDraft: (document: EditorDocument) => void;
}) {
  const { detail, detailActions, documentDraft, fieldModelDraft, formulaRows, formulaComputation, messageSection, setDocumentDraft } = input;
  return createSectionSection("docs-editor-paper", {
    title: detail.title,
    subtitle: `${statusLabel(detail.status)} · ${roleLabel(detail.role)} · ${fieldModelDraft.fields ? formulaRows.length : 0} 字段`,
    actions: detailActions,
    chrome: "plain",
    framed: false,
    sections: [
      ...messageSection,
      createEmptySection("paper-editor", {
        presentation: "plain",
        content: (
          <DocumentEditorCanvas
            document={documentDraft}
            fieldModel={fieldModelDraft}
            computedValues={formulaComputation.previewValues}
            editable={canEdit(detail.role)}
            onChange={setDocumentDraft}
          />
        ),
      }),
    ],
  });
}
