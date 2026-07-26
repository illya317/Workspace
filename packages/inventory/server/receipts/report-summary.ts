import { createHash } from "node:crypto";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type {
  InventoryReceiptMonthlySummary,
  InventoryReceiptReportOption,
  InventoryReceiptReportStatus,
  InventoryReceiptRow,
  InventoryReceiptSummaryTotals,
} from "@workspace/inventory/types";

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

const REPORT_HIERARCHY = {
  productWorkPoints: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  batches: {
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      outputs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  },
} satisfies Prisma.InventoryReceiptReportInclude;

type ReceiptReportHierarchy = Prisma.InventoryReceiptReportGetPayload<{ include: typeof REPORT_HIERARCHY }>;

function decimal(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : Number(value);
}

function reportStatus(value: string): InventoryReceiptReportStatus {
  return value === "submitted" || value === "approved" ? value : "draft";
}

export function receiptReportOption(report: {
  id: number;
  version: number;
  year: number;
  month: number;
  workshopName: string;
  status: string;
  preparedBy: string | null;
  preparedByUserId: number | null;
  preparedAt: Date | null;
  reviewedBy: string | null;
  reviewedByUserId: number | null;
  reviewedAt: Date | null;
}): InventoryReceiptReportOption {
  const status = reportStatus(report.status);
  return {
    id: report.id,
    version: report.version,
    year: report.year,
    month: report.month,
    workshopName: report.workshopName,
    status,
    preparedBy: report.preparedBy,
    preparedByUserId: report.preparedByUserId,
    preparedAt: report.preparedAt?.toISOString() ?? null,
    reviewedBy: report.reviewedBy,
    reviewedByUserId: report.reviewedByUserId,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    canEdit: status === "draft",
  };
}

export async function listReceiptReports(client: DatabaseClient = prisma): Promise<InventoryReceiptReportOption[]> {
  const reports = await client.inventoryReceiptReport.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }, { id: "desc" }] });
  return reports.map(receiptReportOption);
}

function flattenedRows(report: ReceiptReportHierarchy | null): InventoryReceiptRow[] {
  if (!report) return [];
  return report.batches.flatMap((batch) => batch.outputs.map((output) => {
    const productWorkPoint = report.productWorkPoints.find((item) => item.productId === batch.productId) ?? null;
    const caseQuantity = decimal(output.caseQuantity);
    const extraPackageQuantity = decimal(output.extraPackageQuantity);
    const packagesPerCase = Number(output.packagesPerCase);
    const unitsPerPackage = Number(output.unitsPerPackage);
    const convertedPackages = caseQuantity === null ? null : caseQuantity * packagesPerCase + (extraPackageQuantity ?? 0);
    return {
      id: output.id,
      version: output.version,
      reportId: report.id,
      batchId: batch.id,
      batchVersion: batch.version,
      productId: batch.productId,
      productWorkPointId: productWorkPoint?.id ?? null,
      productWorkPointVersion: productWorkPoint?.version ?? null,
      workPoints: decimal(productWorkPoint?.workPoints ?? null),
      year: report.year,
      month: report.month,
      productName: batch.productName,
      specification: batch.specification,
      batchNumber: batch.batchNumber,
      inputQuantityTenThousands: decimal(batch.inputQuantityTenThousands),
      productionQuantityText: output.productionQuantityText,
      caseQuantity,
      extraPackageQuantity,
      packagesPerCase,
      unitsPerPackage,
      packageUnit: output.packageUnit,
      packagingNote: output.packagingNote,
      convertedPackages,
      convertedTenThousands: convertedPackages === null ? null : convertedPackages * unitsPerPackage / 10000,
      sourceConvertedPackages: decimal(output.sourceConvertedPackages),
      sourceConvertedTenThousands: decimal(output.sourceConvertedTenThousands),
      sourceConvertedPackagesFormula: output.sourceConvertedPackagesFormula,
      sourceConvertedTenThousandsFormula: output.sourceConvertedTenThousandsFormula,
      auditStatus: output.auditStatus,
      auditNote: output.auditNote,
      sourceFile: output.sourceFile,
      sourceSheet: output.sourceSheet,
      sourceRow: output.sourceRow,
    } satisfies InventoryReceiptRow;
  }));
}

export function compareReceiptRowsChronologically(left: InventoryReceiptRow, right: InventoryReceiptRow) {
  return right.year - left.year
    || right.month - left.month
    || right.batchNumber.localeCompare(left.batchNumber, "zh-CN", { numeric: true, sensitivity: "base" })
    || left.batchId - right.batchId
    || left.id - right.id;
}

export function calculateReceiptSummaryTotals(rows: InventoryReceiptRow[]): InventoryReceiptSummaryTotals {
  const batches = new Map<number, number>();
  const productWorkPoints = new Map<number, number>();
  let convertedPackages = 0;
  let convertedTenThousands = 0;
  for (const row of rows) {
    if (!batches.has(row.batchId)) batches.set(row.batchId, row.inputQuantityTenThousands ?? 0);
    if (row.productWorkPointId !== null && !productWorkPoints.has(row.productWorkPointId)) {
      productWorkPoints.set(row.productWorkPointId, row.workPoints ?? 0);
    }
    convertedPackages += row.convertedPackages ?? 0;
    convertedTenThousands += row.convertedTenThousands ?? 0;
  }
  return {
    inputQuantityTenThousands: [...batches.values()].reduce((sum, value) => sum + value, 0),
    workPoints: [...productWorkPoints.values()].reduce((sum, value) => sum + value, 0),
    convertedPackages,
    convertedTenThousands,
  };
}

function canonicalSnapshot(report: ReceiptReportHierarchy, rows: InventoryReceiptRow[], totals: InventoryReceiptSummaryTotals) {
  return {
    schemaVersion: 4,
    report: { id: report.id, year: report.year, month: report.month, workshopName: report.workshopName },
    rows: rows.map((row) => ({
      outputId: row.id,
      batchId: row.batchId,
      productId: row.productId,
      productWorkPointId: row.productWorkPointId,
      workPoints: row.workPoints,
      productName: row.productName,
      specification: row.specification,
      batchNumber: row.batchNumber,
      inputQuantityTenThousands: row.inputQuantityTenThousands,
      productionQuantityText: row.productionQuantityText,
      caseQuantity: row.caseQuantity,
      extraPackageQuantity: row.extraPackageQuantity,
      packagesPerCase: row.packagesPerCase,
      unitsPerPackage: row.unitsPerPackage,
      packageUnit: row.packageUnit,
      packagingNote: row.packagingNote,
      convertedPackages: row.convertedPackages,
      convertedTenThousands: row.convertedTenThousands,
    })),
    totals,
  };
}

function priorProductWorkPointSnapshot(report: ReceiptReportHierarchy, rows: InventoryReceiptRow[], totals: InventoryReceiptSummaryTotals) {
  return {
    schemaVersion: 3,
    report: { id: report.id, year: report.year, month: report.month, workshopName: report.workshopName },
    rows: rows.map((row) => ({
      outputId: row.id,
      batchId: row.batchId,
      productWorkPointId: row.productWorkPointId,
      workPoints: row.workPoints,
      productName: row.productName,
      specification: row.specification,
      batchNumber: row.batchNumber,
      inputQuantityTenThousands: row.inputQuantityTenThousands,
      productionQuantityText: row.productionQuantityText,
      caseQuantity: row.caseQuantity,
      extraPackageQuantity: row.extraPackageQuantity,
      packagesPerCase: row.packagesPerCase,
      unitsPerPackage: row.unitsPerPackage,
      packageUnit: row.packageUnit,
      packagingNote: row.packagingNote,
      convertedPackages: row.convertedPackages,
      convertedTenThousands: row.convertedTenThousands,
    })),
    totals,
  };
}

function legacyCanonicalSnapshot(report: ReceiptReportHierarchy, rows: InventoryReceiptRow[], totals: InventoryReceiptSummaryTotals) {
  return {
    schemaVersion: 2,
    report: { id: report.id, year: report.year, month: report.month, workshopName: report.workshopName },
    rows: rows.map((row) => ({
      outputId: row.id,
      batchId: row.batchId,
      productName: row.productName,
      specification: row.specification,
      batchNumber: row.batchNumber,
      inputQuantityTenThousands: row.inputQuantityTenThousands,
      productionQuantityText: row.productionQuantityText,
      caseQuantity: row.caseQuantity,
      extraPackageQuantity: row.extraPackageQuantity,
      packagesPerCase: row.packagesPerCase,
      unitsPerPackage: row.unitsPerPackage,
      packageUnit: row.packageUnit,
      packagingNote: row.packagingNote,
      convertedPackages: row.convertedPackages,
      convertedTenThousands: row.convertedTenThousands,
    })),
    totals: {
      inputQuantityTenThousands: totals.inputQuantityTenThousands,
      convertedPackages: totals.convertedPackages,
      convertedTenThousands: totals.convertedTenThousands,
    },
  };
}

function snapshotHash(snapshot: object) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function loadReport(client: DatabaseClient, reportId: number) {
  return client.inventoryReceiptReport.findUnique({ where: { id: reportId }, include: REPORT_HIERARCHY });
}

export async function buildReceiptReportSnapshot(client: DatabaseClient, reportId: number) {
  const report = await loadReport(client, reportId);
  if (!report) return null;
  const snapshotRows = flattenedRows(report);
  const totals = calculateReceiptSummaryTotals(snapshotRows);
  const snapshot = canonicalSnapshot(report, snapshotRows, totals);
  const priorSnapshot = priorProductWorkPointSnapshot(report, snapshotRows, totals);
  const legacySnapshot = legacyCanonicalSnapshot(report, snapshotRows, totals);
  const hash = snapshotHash(snapshot);
  const priorHash = snapshotHash(priorSnapshot);
  const legacyHash = snapshotHash(legacySnapshot);
  return { report, rows: snapshotRows.toSorted(compareReceiptRowsChronologically), totals, snapshot, hash, priorSnapshot, priorHash, legacySnapshot, legacyHash };
}

export function isLegacyReceiptSnapshotCurrent(built: NonNullable<Awaited<ReturnType<typeof buildReceiptReportSnapshot>>>) {
  const compatibleHashes = built.report.confirmationSource === "legacy_workbook"
    ? [built.priorHash, built.legacyHash]
    : [built.priorHash];
  return built.rows.every((row) => row.productId !== null)
    && built.rows.every((row) => row.productWorkPointId !== null && row.workPoints !== null)
    && compatibleHashes.includes(built.report.confirmedSnapshotHash ?? "");
}

export async function loadReceiptMonthlySummary(
  filters: { year?: number; month?: number },
  client: DatabaseClient = prisma,
): Promise<InventoryReceiptMonthlySummary | null> {
  const selected = await client.inventoryReceiptReport.findFirst({
    where: { year: filters.year, month: filters.month },
    orderBy: [{ year: "desc" }, { month: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!selected) return null;
  const built = await buildReceiptReportSnapshot(client, selected.id);
  if (!built) return null;
  const option = receiptReportOption(built.report);
  return {
    report: option,
    rows: built.rows,
    totals: built.totals,
    snapshotCurrent: option.status === "draft"
      || built.report.confirmedSnapshotHash === built.hash
      || isLegacyReceiptSnapshotCurrent(built),
  };
}
