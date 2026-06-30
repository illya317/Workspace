export const DOCS_EDITOR_SPACE_KINDS = ["personal", "department"] as const;
export const DOCS_EDITOR_TEMPLATE_STATUSES = ["draft", "reviewing", "published", "archived"] as const;
export const DOCS_EDITOR_PERMISSION_ROLES = ["viewer", "editor", "manager"] as const;

export type DocsEditorSpaceKind = (typeof DOCS_EDITOR_SPACE_KINDS)[number];
export type DocsEditorTemplateStatus = (typeof DOCS_EDITOR_TEMPLATE_STATUSES)[number];
export type DocsEditorPermissionRole = (typeof DOCS_EDITOR_PERMISSION_ROLES)[number];

export type DocumentTemplateSpaceKind = DocsEditorSpaceKind;
export type DocumentTemplateStatus = DocsEditorTemplateStatus;
export type DocumentTemplateRole = DocsEditorPermissionRole;

export interface DocsEditorSpaceDto {
  id: string;
  kind: DocsEditorSpaceKind;
  title: string;
  description?: string;
  departmentId?: number | null;
  role: DocsEditorPermissionRole;
}

export interface DocsEditorTemplateListItemDto {
  id: string;
  title: string;
  type: string;
  status: DocsEditorTemplateStatus;
  spaceId: string;
  updatedAt: string;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
  role: DocsEditorPermissionRole;
}

export interface DocsEditorTemplatePermissionDto {
  id: string;
  userId: number;
  userName: string;
  role: DocsEditorPermissionRole;
}

export interface DocsEditorTemplateDetailDto extends DocsEditorTemplateListItemDto {
  document: unknown;
  fieldModel: unknown;
  permissions: DocsEditorTemplatePermissionDto[];
}

export interface DocsEditorBootstrapDto {
  spaces: DocsEditorSpaceDto[];
  templates: DocsEditorTemplateListItemDto[];
}

export type DocumentTemplateSpaceDto = DocsEditorSpaceDto;
export type DocumentTemplateListItemDto = DocsEditorTemplateListItemDto;
export type DocumentTemplatePermissionDto = DocsEditorTemplatePermissionDto;
export type DocumentTemplateDetailDto = DocsEditorTemplateDetailDto;
export type DocumentTemplateBootstrapDto = DocsEditorBootstrapDto;

export interface SaveDocumentTemplateDraftCommand {
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

export interface UpdateDocumentTemplatePermissionsCommand {
  permissions: Array<{ userId: number; role: DocsEditorPermissionRole }>;
}
