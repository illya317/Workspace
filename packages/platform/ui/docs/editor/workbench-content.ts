import type { Dispatch, SetStateAction } from "react";
import {
  createMessageSection,
  createPageBody,
  createSectionSection,
  type BodySurfaceCommandSpec,
  type CreateSurfaceSubmissionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type { DocumentEditorCanvasProps, EditorDocument, FieldModel } from "@workspace/platform/document-editor";
import type {
  EditorSpaceDto,
  EditorTemplateDetailDto,
  EditorTemplateListItemDto,
} from "./api";
import {
  actionAccessLabel,
  formatDateTime,
  statusLabel,
  statusTone,
  type evaluateFieldModel,
} from "./model";
import { createEditorDetailSection } from "./sections";

export function docsEditorLeftPane(input: {
  activeSpace: EditorSpaceDto | null;
  activeTemplateId: string | null;
  loading: boolean;
  templates: EditorTemplateListItemDto[];
  onSelectTemplate: (item: EditorTemplateListItemDto) => void;
}) {
  return {
    kind: "selector" as const,
    selector: {
      kind: "list" as const,
      title: input.activeSpace ? input.activeSpace.title : "文档模板",
      items: input.templates.map((item) => ({
        key: item.id,
        value: item,
        card: {
          title: item.title,
          subtitle: `${item.stageCount ?? 0} 阶段 · ${item.tableCount ?? 0} 表格 · ${item.fieldCount ?? 0} 字段 · ${item.formulaCount ?? 0} 公式`,
          code: statusLabel(item.status),
          codeTone: statusTone(item.status),
          meta: [
            actionAccessLabel(item.actionPermissions),
            item.type.toUpperCase(),
            formatDateTime(item.updatedAt),
          ],
        },
      })),
      selectedId: input.activeTemplateId,
      loading: input.loading,
      loadingText: "加载模板...",
      emptyText: "暂无模板",
      onSelect: input.onSelectTemplate,
      size: "sm" as const,
    },
  };
}

export function docsEditorBody(input: {
  activeSpace: EditorSpaceDto | null;
  message: string | null;
  createOpen: boolean;
  createTitle: string;
  createSubmission: CreateSurfaceSubmissionSpec | null;
  detailHeaderActions: BodySurfaceCommandSpec[];
  detail: EditorTemplateDetailDto | null;
  detailLoading: boolean;
  documentDraft: EditorDocument;
  fieldModelDraft: FieldModel;
  formulaComputation: ReturnType<typeof evaluateFieldModel>;
  canEditTemplateDraft: boolean;
  assistantAction?: DocumentEditorCanvasProps["assistantAction"];
  setDocumentDraft: Dispatch<SetStateAction<EditorDocument>>;
  onCreateTitleChange: (title: string) => void;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const templateEditorSection = createSectionSection("docs-editor-template-editor", {
    title: input.detail ? input.detail.title : input.activeSpace ? `${input.activeSpace.title}编辑器` : "模板编辑器",
    actions: input.detailHeaderActions,
    sections: [
      ...(input.message ? [createMessageSection("docs-editor-list-message", {
        content: input.message,
        tone: input.message.includes("失败") ? "danger" as const : "success" as const,
      })] : []),
      ...(input.createSubmission ? [{
        key: "docs-editor-create-template",
        body: {
          kind: "create" as const,
          create: {
            id: "docs-editor-create-template",
            trigger: "toolbar" as const,
            presentation: "inline" as const,
            title: "新建模板",
            open: input.createOpen,
            content: { kind: "form" as const, form: { items: [{
            key: "title",
            label: "文件名",
            required: true,
            spec: { valueType: "string", control: "text", validation: { required: true } },
            value: input.createTitle,
            placeholder: "请输入文件名",
            onChange: (value: unknown) => input.onCreateTitleChange(String(value ?? "")),
            } satisfies FormSurfaceItemSpec], layout: { columns: 2 as const } } },
            submission: input.createSubmission,
            onOpenChange: input.onCreateOpenChange,
            onCancel: () => input.onCreateTitleChange(""),
          },
        },
      }] : []),
      createEditorDetailSection({
        detail: input.detail,
        detailLoading: input.detailLoading,
        documentDraft: input.documentDraft,
        fieldModelDraft: input.fieldModelDraft,
        formulaComputation: input.formulaComputation,
        message: null,
        editable: input.canEditTemplateDraft,
        assistantAction: input.assistantAction,
        setDocumentDraft: input.setDocumentDraft,
      }),
    ],
  });

  return createPageBody([templateEditorSection]);
}
