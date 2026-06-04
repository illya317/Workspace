export interface LibraryDocumentItem {
  id: number;
  stableKey: string;
  fileName: string;
  relativePath: string | null;
  extension: string | null;
  fileSizeBytes: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategoryPath: string | null;
  title: string | null;
  summary: string | null;
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
  status?: string;
  origin?: string;
  confidentialityLevel?: number;
  keyword?: string;
}

export interface CategoryGroup {
  code: string;
  name: string;
  count: number;
}
