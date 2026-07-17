const LIBRARY_OFFICE_DOCUMENT_TYPES = {
  doc: "word",
  docx: "word",
  odt: "word",
  xls: "cell",
  xlsx: "cell",
  ods: "cell",
  ppt: "slide",
  pptx: "slide",
  odp: "slide",
} as const;

export type LibraryOfficeExtension = keyof typeof LIBRARY_OFFICE_DOCUMENT_TYPES;
export type OnlyOfficeDocumentType = (typeof LIBRARY_OFFICE_DOCUMENT_TYPES)[LibraryOfficeExtension];

export function libraryOfficeDocumentType(extension: string | null | undefined): OnlyOfficeDocumentType | null {
  const normalized = extension?.trim().toLowerCase() as LibraryOfficeExtension | undefined;
  return normalized ? LIBRARY_OFFICE_DOCUMENT_TYPES[normalized] ?? null : null;
}

export function isLibraryOfficeExtension(extension: string | null | undefined) {
  return libraryOfficeDocumentType(extension) !== null;
}
