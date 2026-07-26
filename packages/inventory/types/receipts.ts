export type InventoryReceiptRow = {
  id: number;
  version: number;
  reportId: number;
  batchId: number;
  batchVersion: number;
  productId: number | null;
  productWorkPointId: number | null;
  productWorkPointVersion: number | null;
  workPoints: number | null;
  year: number;
  month: number;
  productName: string;
  specification: string | null;
  batchNumber: string;
  inputQuantityTenThousands: number | null;
  productionQuantityText: string | null;
  caseQuantity: number | null;
  extraPackageQuantity: number | null;
  packagesPerCase: number;
  unitsPerPackage: number;
  packageUnit: string;
  packagingNote: string;
  convertedPackages: number | null;
  convertedTenThousands: number | null;
  sourceConvertedPackages: number | null;
  sourceConvertedTenThousands: number | null;
  sourceConvertedPackagesFormula: string | null;
  sourceConvertedTenThousandsFormula: string | null;
  auditStatus: string;
  auditNote: string | null;
  sourceFile: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
};

export type InventoryReceiptProductCatalogItem = {
  productId: number;
  productName: string;
  specification: string;
  productCode: string;
  defaultPackagingNote: string;
  packagingNotes: string[];
};

export type InventoryReceiptReportStatus = "draft" | "submitted" | "approved";

export type InventoryReceiptReportOption = {
  id: number;
  version: number;
  year: number;
  month: number;
  workshopName: string;
  status: InventoryReceiptReportStatus;
  preparedBy: string | null;
  preparedByUserId: number | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  canEdit: boolean;
};

export type InventoryReceiptSummaryTotals = {
  inputQuantityTenThousands: number;
  workPoints: number;
  convertedPackages: number;
  convertedTenThousands: number;
};

export type InventoryReceiptMonthlySummary = {
  report: InventoryReceiptReportOption;
  rows: InventoryReceiptRow[];
  totals: InventoryReceiptSummaryTotals;
  snapshotCurrent: boolean;
};

export type InventoryReceiptList = {
  rows: InventoryReceiptRow[];
  reports: InventoryReceiptReportOption[];
  summary: InventoryReceiptMonthlySummary | null;
  years: number[];
  productCatalog: InventoryReceiptProductCatalogItem[];
  total: number;
  reportCount: number;
  productCatalogCount: number;
  packagingNoteCount: number;
  auditIssueCount: number;
};
