"use client";

import {
  createEmptySection,
  createMessageSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import {
  DocumentEditorCanvas,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import type {
  EditorTemplateDetailDto,
} from "./api";
import {
  canEdit,
  type FormulaComputation,
} from "./model";

export function createEditorDetailSection(input: {
  detail: EditorTemplateDetailDto | null;
  detailLoading: boolean;
  documentDraft: EditorDocument;
  fieldModelDraft: FieldModel;
  formulaComputation: FormulaComputation;
  message: string | null;
  setDocumentDraft: (document: EditorDocument) => void;
}): BodySurfaceSectionSpec {
  const {
    detail,
    detailLoading,
    documentDraft,
    fieldModelDraft,
    formulaComputation,
    message,
    setDocumentDraft,
  } = input;

  if (detailLoading) {
    return createHeaderlessSection("docs-editor-detail", [
      createStatusSection("detail-loading", { kind: "loading", content: "加载模板详情..." }),
    ]);
  }

  if (!detail) {
    return createHeaderlessSection("docs-editor-detail", [
      createEmptySection("detail-empty", { content: "请选择一个模板", compact: true }),
    ]);
  }

  const messageSection = message
    ? [createMessageSection("docs-editor-message", { content: message, tone: message.includes("失败") ? "danger" : "success" })]
    : [];

  return createPaperTabSection({
    detail,
    documentDraft,
    fieldModelDraft,
    formulaComputation,
    messageSection,
    setDocumentDraft,
  });
}

function createHeaderlessSection(key: string, sections: BodySurfaceSectionSpec[]): BodySurfaceSectionSpec {
  return {
    key,
    chrome: "plain",
    framed: false,
    body: {
      kind: "section",
      sections,
    },
  };
}

function createPaperTabSection(input: {
  detail: EditorTemplateDetailDto;
  documentDraft: EditorDocument;
  fieldModelDraft: FieldModel;
  formulaComputation: FormulaComputation;
  messageSection: BodySurfaceSectionSpec[];
  setDocumentDraft: (document: EditorDocument) => void;
}): BodySurfaceSectionSpec {
  const { detail, documentDraft, fieldModelDraft, formulaComputation, messageSection, setDocumentDraft } = input;
  return {
    key: "docs-editor-paper",
    chrome: "plain" as const,
    framed: false,
    body: {
      kind: "section" as const,
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
    },
  };
}
