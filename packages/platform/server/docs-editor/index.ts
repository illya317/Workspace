export {
  copyTemplate,
  deleteDraft,
  getEditorBootstrap,
  getPublishedHrPositionDescriptionOfficialTemplate,
  getTemplate,
  listSpaces,
  listTemplates,
  saveDraft,
} from "./service";
export { ensureDocsEditorSpaceForTarget } from "./space-service";
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
  normalizeDocumentTemplatePayload,
} from "./domain/document-template-validation";
export {
  deleteTemplateContentFiles,
  isStructuredTemplateContentRef,
  planTemplateContentRefs,
  readTemplateContentJson,
  templateContentFilesStatus,
  writeTemplateContentJson,
  type DocsEditorTemplateStorageMode,
} from "./content-store";
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
