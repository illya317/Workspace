export {
  createEmptyEditorDocument,
  createId,
  editorDocumentToTiptapJson,
  tiptapJsonToEditorDocument,
} from "./adapters";
export { default as DocumentEditorCanvas } from "./DocumentEditorCanvas";
export {
  DOCUMENT_EDITOR_COMPACT_LANDSCAPE_QUERY,
  DOCUMENT_EDITOR_MOBILE_PORTRAIT_QUERY,
  useDocumentEditorMobileLayout,
} from "./mobile-layout";
export { default as DocumentPreview } from "./DocumentPreview";
export { createDocumentWorkspaceSection } from "./DocumentWorkspaceSurface";
export { PageBreakNode } from "./page-break-extension";
export {
  FieldSlot,
  FormulaSlot,
  DateSlot,
  SignatureSlot,
  DocumentEditorSlotExtensions,
} from "./slot-extensions";
export { slotContextLabel } from "./slot-numbering";
export {
  EditorDocumentPreview,
  renderEditorDocumentPreview,
} from "./preview";
export {
  exportEditorDocumentToDocxBlob,
  exportEditorDocumentToDocxBuffer,
} from "./docx-adapter";
export type {
  DocumentEditorCanvasProps,
  DocumentPreviewProps,
  EditorBlock,
  EditorBlockType,
  EditorDocument,
  EditorHeadingBlock,
  EditorInline,
  EditorInlineType,
  EditorPageBreakBlock,
  EditorParagraphBlock,
  EditorSlotInline,
  EditorSlotType,
  EditorTableBlock,
  EditorTableCell,
  EditorTableRow,
  FieldDefinition,
  FieldModel,
  FormulaDefinition,
  FormulaTemplateDefinition,
} from "./types";
export type { DocumentWorkspaceEditSpec, DocumentWorkspacePreviewSpec, DocumentWorkspaceSpec } from "./DocumentWorkspaceSurface";
