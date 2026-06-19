import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";

export interface ImportCreateInput {
  profile: string;
  year?: number;
  sourceFile: string;
  sourcePath?: string;
  normalizedJsonPath?: string;
  checksum?: string;
  importedBy?: string;
  recordCount: number;
  warningCount: number;
  errorCount: number;
}

export async function createImport(data: ImportCreateInput) {
  return prisma.financeDataImport.create({
    data: {
      profile: data.profile,
      year: data.year ?? null,
      sourceFile: data.sourceFile,
      sourcePath: data.sourcePath ?? null,
      normalizedJsonPath: data.normalizedJsonPath ?? null,
      checksum: data.checksum ?? null,
      importedBy: data.importedBy ?? null,
      recordCount: data.recordCount,
      warningCount: data.warningCount,
      errorCount: data.errorCount,
    },
  });
}

export async function findExistingImport(profile: string, year: number | undefined, sourceFile: string) {
  return prisma.financeDataImport.findFirst({
    where: {
      profile,
      year: year ?? null,
      sourceFile,
    },
  });
}

export async function deleteImportById(id: number) {
  return prisma.financeDataImport.delete({
    where: { id },
  });
}

export async function listImports(params: { page?: number; pageSize?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.financeDataImport.findMany({
      orderBy: { importedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.financeDataImport.count(),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getImportById(id: number) {
  return prisma.financeDataImport.findUnique({
    where: { id },
    include: {
      shipments: { take: 5 },
      salesSalaries: { take: 5 },
      workshopReports: { take: 5 },
      costStructureRows: { take: 5 },
      costAnalysisRows: { take: 5 },
    },
  });
}

export async function createShipments(
  importId: number,
  rows: Prisma.FinanceShipmentCreateManyInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.financeShipment.createMany({
    data: rows.map((r) => ({ ...r, importId })),
  });
}

export async function createSalesSalaries(
  importId: number,
  rows: Prisma.FinanceSalesSalaryCreateManyInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.financeSalesSalary.createMany({
    data: rows.map((r) => ({ ...r, importId })),
  });
}

export async function createCostStructureRows(
  importId: number,
  rows: Prisma.FinanceCostStructureRowCreateManyInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.financeCostStructureRow.createMany({
    data: rows.map((r) => ({ ...r, importId })),
  });
}

export async function createCostAnalysisRows(
  importId: number,
  rows: Prisma.FinanceCostAnalysisRowCreateManyInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.financeCostAnalysisRow.createMany({
    data: rows.map((r) => ({ ...r, importId })),
  });
}

export async function createWorkshopReports(
  importId: number,
  rows: Prisma.FinanceWorkshopReportCreateManyInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.financeWorkshopReport.createMany({
    data: rows.map((r) => ({ ...r, importId })),
  });
}
