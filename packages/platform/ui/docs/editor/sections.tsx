"use client";

import {
  createDocumentSection,
  createEmptySection,
  createFieldsSection,
  createMessageSection,
  createPageDataSection,
  createSectionSection,
  createStatusSection,
  type BodySurfaceCommandSpec,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import {
  DocumentEditorCanvas,
  DocumentPreview,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import type {
  EditorPermissionRole,
  EditorTemplateDetailDto,
  EditorTemplateListItemDto,
} from "./api";
import {
  EDITOR_PERMISSION_ROLES,
  addFormulaField,
  canEdit,
  canManage,
  isGeneratedTemplate,
  normalizePermissionRole,
  roleLabel,
  statusLabel,
  type FieldFormulaRow,
  type FormulaComputation,
} from "./model";

export function createEditorDetailSection(input: {
  activeTab: string;
  detail: EditorTemplateDetailDto | null;
  detailActions: BodySurfaceCommandSpec[];
  detailLoading: boolean;
  documentDraft: EditorDocument;
  fieldColumns: DataSurfaceColumnSpec<FieldFormulaRow>[];
  fieldModelDraft: FieldModel;
  formulaRows: FieldFormulaRow[];
  formulaComputation: FormulaComputation;
  message: string | null;
  permissionColumns: DataSurfaceColumnSpec<EditorTemplateDetailDto["permissions"][number]>[];
  selectedTemplate: EditorTemplateListItemDto | null;
  setFieldModelDraft: (updater: (current: FieldModel) => FieldModel) => void;
  setDocumentDraft: (document: EditorDocument) => void;
  publishRequest: () => void;
  publishOfficial: () => void;
  grantRole: EditorPermissionRole;
  grantUserId: string;
  setGrantRole: (role: EditorPermissionRole) => void;
  setGrantUserId: (value: string) => void;
  addPermissionGrant: () => void;
  removePermissionGrant: (userId: number) => void;
  busy: string | null;
}): BodySurfaceSectionSpec {
  const {
    activeTab,
    detail,
    detailActions,
    detailLoading,
    documentDraft,
    fieldColumns,
    fieldModelDraft,
    formulaRows,
    formulaComputation,
    message,
    permissionColumns,
    selectedTemplate,
    setFieldModelDraft,
    setDocumentDraft,
    publishRequest,
    publishOfficial,
    grantRole,
    grantUserId,
    setGrantRole,
    setGrantUserId,
    addPermissionGrant,
    removePermissionGrant,
    busy,
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
      fieldColumns,
      formulaRows,
      formulaComputation,
      messageSection,
      setFieldModelDraft,
    });
  }

  if (activeTab === "permissions") {
    return createPermissionsTabSection({
      detail,
      detailActions,
      permissionColumns,
      messageSection,
      publishRequest,
      publishOfficial,
      grantRole,
      grantUserId,
      setGrantRole,
      setGrantUserId,
      addPermissionGrant,
      removePermissionGrant,
      busy,
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
  fieldColumns: DataSurfaceColumnSpec<FieldFormulaRow>[];
  formulaRows: FieldFormulaRow[];
  formulaComputation: FormulaComputation;
  messageSection: BodySurfaceSectionSpec[];
  setFieldModelDraft: (updater: (current: FieldModel) => FieldModel) => void;
}) {
  const { detail, detailActions, fieldColumns, formulaRows, formulaComputation, messageSection, setFieldModelDraft } = input;
  return createSectionSection("docs-editor-fields", {
    title: "字段/公式",
    subtitle: `${formulaRows.length} 个字段，公式以字段 key 为稳定引用。${formulaComputation.errorCount ? ` ${formulaComputation.errorCount} 个公式缺少输入或待处理。` : ""}`,
    actions: [
      ...detailActions,
      {
        key: "add-formula",
        label: "新增公式字段",
        onClick: () => setFieldModelDraft(addFormulaField),
        disabled: !canEdit(detail.role) && !isGeneratedTemplate(detail.id),
      },
    ],
    sections: [
      ...messageSection,
      createMessageSection("formula-computation-summary", {
        tone: formulaComputation.errorCount ? "warning" : "success",
        content: `公式检查：${formulaComputation.adapter} · ${formulaComputation.errorCount ? `${formulaComputation.errorCount} 个错误` : "通过"}`,
      }),
      createPageDataSection("field-formula-table", {
        kind: "table",
        rows: formulaRows,
        columns: fieldColumns,
        visibleColumns: fieldColumns.map((column) => column.key),
        emptyText: "暂无字段",
        rowKey: (row: FieldFormulaRow) => row.key,
        presentation: { density: "compact", cellWrap: "wrap" },
      }),
    ],
  });
}

function createPermissionsTabSection(input: {
  detail: EditorTemplateDetailDto;
  detailActions: BodySurfaceCommandSpec[];
  permissionColumns: DataSurfaceColumnSpec<EditorTemplateDetailDto["permissions"][number]>[];
  messageSection: BodySurfaceSectionSpec[];
  publishRequest: () => void;
  publishOfficial: () => void;
  grantRole: EditorPermissionRole;
  grantUserId: string;
  setGrantRole: (role: EditorPermissionRole) => void;
  setGrantUserId: (value: string) => void;
  addPermissionGrant: () => void;
  removePermissionGrant: (userId: number) => void;
  busy: string | null;
}) {
  const {
    detail,
    detailActions,
    permissionColumns,
    messageSection,
    publishRequest,
    publishOfficial,
    grantRole,
    grantUserId,
    setGrantRole,
    setGrantUserId,
    addPermissionGrant,
    removePermissionGrant,
    busy,
  } = input;
  const publishActions: BodySurfaceCommandSpec[] = [
    {
      key: "request-publish",
      label: "申请发布",
      onClick: publishRequest,
      disabled: isGeneratedTemplate(detail.id) || detail.status !== "draft" || busy === "publish-request" || !canEdit(detail.role),
    },
    {
      key: "mark-published",
      label: "标记发布",
      variant: "primary",
      onClick: publishOfficial,
      disabled: isGeneratedTemplate(detail.id) || busy === "publish" || !canManage(detail.role),
    },
  ];
  return createSectionSection("docs-editor-permissions", {
    title: "权限/发布",
    subtitle: "editor 入口权限和模板产物权限分开；个人空间只归本人，部门空间按部门角色和显式授权叠加。",
    actions: [...detailActions, ...publishActions],
    sections: [
      ...messageSection,
      createMessageSection("permission-summary", {
        tone: "muted",
        content: `${detail.title} · ${statusLabel(detail.status)} · 当前权限：${roleLabel(detail.role)}`,
      }),
      createPermissionGrantForm({
        detail,
        grantRole,
        grantUserId,
        setGrantRole,
        setGrantUserId,
        addPermissionGrant,
        busy,
      }),
      createPageDataSection("permission-table", {
        kind: "table",
        rows: detail.permissions,
        columns: permissionColumns,
        visibleColumns: permissionColumns.map((column) => column.key),
        emptyText: "暂无显式授权，使用空间默认权限",
        rowKey: (row: EditorTemplateDetailDto["permissions"][number]) => row.id,
        rowActions: (row: EditorTemplateDetailDto["permissions"][number]) => [{
          key: `remove-${row.id}`,
          label: "移除",
          kind: "delete",
          onClick: () => removePermissionGrant(row.userId),
          disabled: isGeneratedTemplate(detail.id) || !canManage(detail.role) || busy === "permissions",
        }],
        presentation: { density: "compact" },
      }),
    ],
  });
}

function createPermissionGrantForm(input: {
  detail: EditorTemplateDetailDto;
  grantRole: EditorPermissionRole;
  grantUserId: string;
  setGrantRole: (role: EditorPermissionRole) => void;
  setGrantUserId: (value: string) => void;
  addPermissionGrant: () => void;
  busy: string | null;
}) {
  const { detail, grantRole, grantUserId, setGrantRole, setGrantUserId, addPermissionGrant, busy } = input;
  return createFieldsSection("permission-grant-form", [
    {
      key: "grantUserId",
      label: "用户 ID",
      spec: { valueType: "number", control: "number" },
      value: grantUserId,
      onChange: (value) => setGrantUserId(String(value ?? "")),
      placeholder: "输入用户 ID",
    },
    {
      key: "grantRole",
      label: "授权角色",
      spec: {
        valueType: "string",
        control: "choice",
        options: {
          source: "static",
          mode: "dropdown",
          items: EDITOR_PERMISSION_ROLES.map((role) => ({ value: role, label: roleLabel(role) })),
        },
      },
      value: grantRole,
      onChange: (value) => setGrantRole(normalizePermissionRole(value)),
    },
  ], {
    layout: { flow: "inline", columns: 2 },
    commands: [{
      key: "add-permission",
      label: "添加授权",
      variant: "primary",
      onClick: addPermissionGrant,
      disabled: isGeneratedTemplate(detail.id) || !canManage(detail.role) || busy === "permissions",
    }],
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
      createMessageSection("paper-editor", {
        content: (
          <DocumentEditorCanvas
            document={documentDraft}
            fieldModel={fieldModelDraft}
            computedValues={formulaComputation.previewValues}
            editable={canEdit(detail.role) || isGeneratedTemplate(detail.id)}
            onChange={setDocumentDraft}
          />
        ),
      }),
      createSectionSection("paper-preview", {
        title: "Web 预览",
        chrome: "plain",
        framed: false,
        sections: [
          createDocumentSection("paper-preview-surface", {
            kind: "pages",
            pages: {
              items: [{
                key: "preview",
                size: "a4",
                content: <DocumentPreview document={documentDraft} values={formulaComputation.previewValues} />,
              }],
            },
          }),
        ],
      }),
    ],
  });
}
