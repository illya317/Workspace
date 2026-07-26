import type { ActionRuntime } from "../../workflow-action-runtime";

export const DOCS_EDITOR_SPACE_KINDS = ["personal", "company", "committee", "department"] as const;
export const DOCS_EDITOR_TEMPLATE_STATUSES = ["draft", "published", "archived"] as const;

export type DocsEditorSpaceKind = (typeof DOCS_EDITOR_SPACE_KINDS)[number];
export type DocsEditorTemplateStatus = (typeof DOCS_EDITOR_TEMPLATE_STATUSES)[number];

export type DocumentTemplateSpaceKind = DocsEditorSpaceKind;
export type DocumentTemplateStatus = DocsEditorTemplateStatus;

export interface DocsEditorSpaceActionPermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canExport: boolean;
  canManagePermissions: boolean;
}

export interface DocsEditorSpaceDto {
  id: string;
  kind: DocsEditorSpaceKind;
  targetType: DocsEditorSpaceKind;
  targetId: number;
  title: string;
  description?: string;
  departmentId?: number | null;
  actionPermissions: DocsEditorSpaceActionPermissions;
  actionRuntimes: {
    create: ActionRuntime;
    save: ActionRuntime;
    publish: ActionRuntime;
  };
}

export interface DocsEditorTemplateListItemDto {
  id: string;
  title: string;
  type: string;
  status: DocsEditorTemplateStatus;
  spaceId: string;
  version: number;
  updatedAt: string;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
  actionPermissions: DocsEditorSpaceActionPermissions;
}

export interface DocsEditorTemplateDetailDto extends DocsEditorTemplateListItemDto {
  document: unknown;
  fieldModel: unknown;
}

export interface DocsEditorBootstrapDto {
  spaces: DocsEditorSpaceDto[];
  templates: DocsEditorTemplateListItemDto[];
}

export type DocumentTemplateSpaceDto = DocsEditorSpaceDto;
export type DocumentTemplateListItemDto = DocsEditorTemplateListItemDto;
export type DocumentTemplateDetailDto = DocsEditorTemplateDetailDto;
export type DocumentTemplateBootstrapDto = DocsEditorBootstrapDto;

export interface SaveDocumentTemplateDraftCommand {
  version?: number;
  title?: string;
  type?: string | null;
  document?: unknown;
  fieldModel?: unknown;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  sourceStageKeys?: string[] | null;
}

export interface CreateDocumentTemplateCommand extends SaveDocumentTemplateDraftCommand {
  title: string;
  type: string;
  spaceId: string;
  document: unknown;
  fieldModel: unknown;
}
