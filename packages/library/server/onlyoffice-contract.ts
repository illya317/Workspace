export { libraryOfficeDocumentType } from "../constants/office-preview";
export {
  onlyOfficeDocumentKey as libraryOfficeDocumentKey,
  renderOnlyOfficeHtml as renderLibraryOnlyOfficeHtml,
} from "@workspace/platform/office-preview";

export function libraryOfficeSourcePath(documentId: number, versionId: number) {
  return `/api/modules/library/integrations/onlyoffice/documents/${documentId}/versions/${versionId}`;
}
