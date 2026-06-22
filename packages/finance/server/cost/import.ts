import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";
import {
  buildFinanceDataImportCommand,
  buildFinanceIdCommand,
  buildFinanceRowsCommand,
} from "../domain/finance-validation";

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
  const command = buildFinanceDataImportCommand(data);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.financeDataImport.create({
    data: {
      profile: command.data.data.profile,
      year: command.data.data.year ?? null,
      sourceFile: command.data.data.sourceFile,
      sourcePath: command.data.data.sourcePath ?? null,
      normalizedJsonPath: command.data.data.normalizedJsonPath ?? null,
      checksum: command.data.data.checksum ?? null,
      importedBy: command.data.data.importedBy ?? null,
      recordCount: command.data.data.recordCount,
      warningCount: command.data.data.warningCount,
      errorCount: command.data.data.errorCount,
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
  const command = buildFinanceIdCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.financeDataImport.delete({
    where: { id: command.data.id },
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
  const command = buildFinanceRowsCommand(importId, rows);
  if (!command.ok) throw new Error(command.issue.message);
  if (rows.length === 0) return { count: 0 };
  return prisma.financeShipment.createMany({
    data: command.data.rows.map((r) => ({ ...r, importId: command.data.id })),
  });
}

export async function createSalesSalaries(
  importId: number,
  rows: Prisma.FinanceSalesSalaryCreateManyInput[],
) {
  const command = buildFinanceRowsCommand(importId, rows);
  if (!command.ok) throw new Error(command.issue.message);
  if (rows.length === 0) return { count: 0 };
  return prisma.financeSalesSalary.createMany({
    data: command.data.rows.map((r) => ({ ...r, importId: command.data.id })),
  });
}

export async function createCostStructureRows(
  importId: number,
  rows: Prisma.FinanceCostStructureRowCreateManyInput[],
) {
  const command = buildFinanceRowsCommand(importId, rows);
  if (!command.ok) throw new Error(command.issue.message);
  if (rows.length === 0) return { count: 0 };
  return prisma.financeCostStructureRow.createMany({
    data: command.data.rows.map((r) => ({ ...r, importId: command.data.id })),
  });
}

export async function createCostAnalysisRows(
  importId: number,
  rows: Prisma.FinanceCostAnalysisRowCreateManyInput[],
) {
  const command = buildFinanceRowsCommand(importId, rows);
  if (!command.ok) throw new Error(command.issue.message);
  if (rows.length === 0) return { count: 0 };
  return prisma.financeCostAnalysisRow.createMany({
    data: command.data.rows.map((r) => ({ ...r, importId: command.data.id })),
  });
}

export async function createWorkshopReports(
  importId: number,
  rows: Prisma.FinanceWorkshopReportCreateManyInput[],
) {
  const command = buildFinanceRowsCommand(importId, rows);
  if (!command.ok) throw new Error(command.issue.message);
  if (rows.length === 0) return { count: 0 };
  return prisma.financeWorkshopReport.createMany({
    data: command.data.rows.map((r) => ({ ...r, importId: command.data.id })),
  });
}
