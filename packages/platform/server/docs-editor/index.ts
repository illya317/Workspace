export {
  copyTemplate,
  deleteDraft,
  getEditorBootstrap,
  getTemplate,
  listSpaces,
  listTemplates,
  markPublished,
  requestPublish,
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
  copyDocumentTemplate,
  createDocumentTemplate,
  deleteDocumentTemplateDraft,
  DocsEditorServiceError,
  getDocsEditorBootstrap,
  getDocumentTemplate,
  listDocumentTemplateSpaces,
  listDocumentTemplates,
  markDocumentTemplatePublished,
  requestDocumentTemplatePublish,
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
