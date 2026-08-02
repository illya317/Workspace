import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import {
  buildFinanceDataImportCommand,
  buildFinanceRowsCommand,
} from "../import/validation";
import { buildFinanceIdCommand } from "../domain/shared-validation";

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

export async function deleteImportById(id: number, userId: number) {
  const command = buildFinanceIdCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  const result = await guardedDelete({
    entityType: "FinanceDataImport",
    modelKey: "financeDataImport",
    id: command.data.id,
    userId,
    actionLabel: "删除成本导入批次",
    deleteMode: "hard",
    references: [
      { label: "成本分析明细", count: (tx) => tx.financeCostAnalysisRow.count({ where: { importId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeCostAnalysisRow.deleteMany({ where: { importId: command.data.id } }).then(() => undefined) },
      { label: "成本结构明细", count: (tx) => tx.financeCostStructureRow.count({ where: { importId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeCostStructureRow.deleteMany({ where: { importId: command.data.id } }).then(() => undefined) },
      { label: "销售工资明细", count: (tx) => tx.financeSalesSalary.count({ where: { importId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeSalesSalary.deleteMany({ where: { importId: command.data.id } }).then(() => undefined) },
      { label: "发货明细", count: (tx) => tx.financeShipment.count({ where: { importId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeShipment.deleteMany({ where: { importId: command.data.id } }).then(() => undefined) },
      { label: "车间报表明细", count: (tx) => tx.financeWorkshopReport.count({ where: { importId: command.data.id } }), policy: "cascade", cleanup: (tx) => tx.financeWorkshopReport.deleteMany({ where: { importId: command.data.id } }).then(() => undefined) },
    ],
    referencePolicy: "checked",
  });
  return result.ok
    ? { success: true as const, id: result.data.id }
    : { success: false as const, error: result.error, status: result.status || 400 };
}

export async function listImports(params: { importId?: number; page?: number; pageSize?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const skip = (page - 1) * pageSize;
  const where = params.importId === undefined ? {} : { id: params.importId };

  const [data, total] = await Promise.all([
    prisma.financeDataImport.findMany({
      where,
      orderBy: { importedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.financeDataImport.count({ where }),
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
  const names = [...new Set(command.data.rows.flatMap((row) => row.productName?.trim() ? [row.productName.trim()] : []))];
  const products = await prisma.product.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const productsByName = new Map<string, number[]>();
  for (const product of products) productsByName.set(product.name, [...(productsByName.get(product.name) ?? []), product.id]);
  const unresolved = names.filter((name) => productsByName.get(name)?.length !== 1);
  if (unresolved.length) throw new Error(`车间报表产品必须唯一命中 Product：${unresolved.join("、")}`);
  return prisma.financeWorkshopReport.createMany({
    data: command.data.rows.map((r) => ({
      ...r,
      importId: command.data.id,
      productId: r.productName?.trim() ? productsByName.get(r.productName.trim())![0] : r.productId,
    })),
  });
}
