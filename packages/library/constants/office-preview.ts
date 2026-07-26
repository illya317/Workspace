import {
  isOnlyOfficeDocumentExtension,
  onlyOfficeDocumentType,
  type OfficeDocumentExtension,
  type OnlyOfficeDocumentType,
} from "@workspace/platform/office-preview";

export type LibraryOfficeExtension = OfficeDocumentExtension;
export type { OnlyOfficeDocumentType };

export function libraryOfficeDocumentType(extension: string | null | undefined): OnlyOfficeDocumentType | null {
  return onlyOfficeDocumentType(extension);
}

export function isLibraryOfficeExtension(extension: string | null | undefined) {
  return isOnlyOfficeDocumentExtension(extension);
}
