export {
  copyTemplate,
  deleteDraft,
  getEditorBootstrap,
  getTemplate,
  listSpaces,
  listTemplates,
  saveDraft,
} from "./service";
export {
  listSpacePermissions,
  updateSpacePermissions,
} from "./space-permissions";
export {
  executeDocsEditorReferenceOptionsCommand,
} from "./reference-options";
export {
  getPublishedQcOfficialTemplateByProductKey,
  listPublishedQcOfficialTemplateSummaries,
  type PublishedQcOfficialTemplate,
  type PublishedQcOfficialTemplateSummary,
} from "./qc-official-template";
export {
  copyDocumentTemplate,
  createDocumentTemplate,
  deleteDocumentTemplateDraft,
  DocsEditorServiceError,
  getDocsEditorBootstrap,
  getDocumentTemplate,
  listDocumentTemplateSpaces,
  listDocumentTemplates,
  saveDocumentTemplateDraft,
} from "./facade";
export type {
  DocsEditorBootstrapDto,
  DocsEditorPermissionRole,
  DocsEditorSpaceDto,
  DocsEditorSpaceKind,
  DocsEditorTemplateDetailDto,
  DocsEditorTemplateListItemDto,
  DocsEditorTemplateStatus,
  DocumentTemplateBootstrapDto,
  DocumentTemplateDetailDto,
  DocumentTemplateListItemDto,
  DocumentTemplateSpacePermissionDto,
  DocumentTemplateRole,
  DocumentTemplateSpaceDto,
  DocumentTemplateSpaceKind,
  DocumentTemplateStatus,
} from "./types";
