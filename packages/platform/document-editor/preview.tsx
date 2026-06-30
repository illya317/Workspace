import type { ReactNode } from "react";
import DocumentPreview from "./DocumentPreview";
import type { DocumentPreviewProps, EditorDocument } from "./types";

export type EditorDocumentPreviewProps = DocumentPreviewProps;

export const EditorDocumentPreview = DocumentPreview;

export function renderEditorDocumentPreview(document: EditorDocument, values?: Record<string, unknown>): ReactNode {
  return <DocumentPreview document={document} values={values} />;
}
