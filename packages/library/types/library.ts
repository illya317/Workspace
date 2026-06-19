export interface LibraryDocumentItem {
  id: number;
  stableKey: string;
  docId: string | null;
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
  version: number;
  updatedAt: string;
  versions?: Array<{
    id: number;
    versionNo: number;
    createdAt: string;
  }>;
}

export interface LibraryFilters {
  categoryCode?: string;
  directoryPath?: string;
  status?: string;
  origin?: string;
  confidentialityLevel?: number;
  keyword?: string;
  docId?: string;
  tag?: string;
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
