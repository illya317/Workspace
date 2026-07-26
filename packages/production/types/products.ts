export type ProductStatus = "active" | "inactive";

export interface ProductSkuRecord {
  id: number;
  productMasterId: number;
  code: string;
  name: string;
  specification: string | null;
  baseUnit: string;
  contentUnit: string | null;
  unitsPerPackage: number | null;
  packagesPerCase: number | null;
  barcode: string | null;
  status: ProductStatus;
  version: number;
}

export interface ProductSourceMappingRecord {
  id: number;
  targetKind: "product" | "sku" | "pending";
  targetLabel: string | null;
  sourceSystem: string;
  sourceName: string;
  sourceSpecification: string | null;
  status: string;
  sourceFile: string | null;
}

export interface ProductRecord {
  id: number;
  code: string;
  name: string;
  dosageForm: string | null;
  strength: string | null;
  approvalNumber: string | null;
  status: ProductStatus;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  skus: ProductSkuRecord[];
  sourceMappings: ProductSourceMappingRecord[];
}

export interface ProductCatalogResponse {
  items: ProductRecord[];
  total: number;
  skuCount: number;
  sourceMappingCount: number;
  pendingMappingCount: number;
  pendingMappings: ProductSourceMappingRecord[];
}

export interface ProductDraft {
  code: string;
  name: string;
  dosageForm: string | null;
  strength: string | null;
  approvalNumber: string | null;
  status: ProductStatus;
  note: string | null;
  version?: number;
}

export interface ProductSkuDraft {
  code: string;
  name: string;
  specification: string | null;
  baseUnit: string;
  contentUnit: string | null;
  unitsPerPackage: number | null;
  packagesPerCase: number | null;
  barcode: string | null;
  status: ProductStatus;
  version?: number;
}
