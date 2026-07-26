export interface LibraryDocumentVersionItem {
  id: number;
  versionNo: number;
  versionLabel?: string | null;
  fileName?: string;
  extension?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  createdAt: string;
}

export interface LibraryDocumentItem {
  id: number;
  stableKey: string;
  documentUid: string;
  docId: string;
  fileName: string;
  relativePath: string | null;
  directoryPath: string | null;
  extension: string | null;
  fileSizeBytes: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategoryPath: string | null;
  title: string | null;
  summary: string | null;
  tags?: string[];
  confidentialityLevel: number;
  status: string;
  origin: string;
  reviewStatus: string;
  processing?: {
    markdown: string;
    preview: string;
  };
  version: number;
  updatedAt: string;
  versions?: LibraryDocumentVersionItem[];
}

export interface LibraryFilters {
  categoryCode?: string;
  directoryPath?: string;
  status?: string;
  origin?: string;
  confidentialityLevel?: number;
  keyword?: string;
  docId?: string;
}

export interface CategoryGroup {
  code: string;
  name: string;
  count: number;
}

export interface DirectoryNode {
  path: string;
  name: string;
  count: number;
  children: DirectoryNode[];
}
