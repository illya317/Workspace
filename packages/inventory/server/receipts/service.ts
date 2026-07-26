import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { defineBusinessActionCommandAdapter, executeDirectBusinessActionCommand } from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { getActiveFinishedGood, listActiveFinishedGoods } from "@workspace/platform/server/product-master";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import type { InventoryReceiptList, InventoryReceiptProductCatalogItem, InventoryReceiptRow } from "@workspace/inventory/types";
import {
  buildReceiptCreateCommand,
  buildReceiptDeleteCommand,
  buildReceiptUpdateCommand,
  type ReceiptCreateCommand,
  type ReceiptDeleteCommand,
  type ReceiptUpdateCommand,
} from "../domain/inventory-receipts-validation";
import type { InventoryReceiptCreateInput, InventoryReceiptUpdateInput } from "./schemas";
import { compareReceiptRowsChronologically, listReceiptReports, loadReceiptMonthlySummary } from "./report-summary";

export type ReceiptListFilters = { year?: number; month?: number; q?: string };
type CreateInput = { body: InventoryReceiptCreateInput; userId: number };
type UpdateInput = { id: number; body: InventoryReceiptUpdateInput; userId: number };
type DeleteInput = { id: number; userId: number; expectedVersion?: number };

function decimal(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : Number(value);
}

function outputRow(output: Awaited<ReturnType<typeof loadOutputs>>[number]): InventoryReceiptRow {
  const batch = output.batch;
  const report = batch.report;
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
  };
}

function loadOutputs(filters: ReceiptListFilters) {
  const q = filters.q?.trim();
  return prisma.inventoryReceiptOutput.findMany({
    where: {
      batch: { report: { year: filters.year, month: filters.month } },
      ...(q ? { OR: [
        { batch: { batchNumber: { contains: q, mode: "insensitive" } } },
        { batch: { productName: { contains: q, mode: "insensitive" } } },
        { batch: { specification: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    },
    include: { batch: { include: { report: { include: { productWorkPoints: true } } } } },
    orderBy: { id: "asc" },
  });
}

function packagingText(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/[×xX]/g, "*");
}

async function loadProductCatalog(): Promise<InventoryReceiptProductCatalogItem[]> {
  const [products, outputs] = await Promise.all([
    listActiveFinishedGoods(),
    prisma.inventoryReceiptOutput.findMany({
    select: {
      packagingNote: true,
      packageUnit: true,
      packagesPerCase: true,
      unitsPerPackage: true,
      batch: { select: { productId: true } },
    },
    }),
  ]);
  type PackagingStat = { count: number; packageUnit: string; packagesPerCase: number; unitsPerPackage: number };
  const packagingByProduct = new Map<number, Map<string, PackagingStat>>();
  for (const output of outputs) {
    if (output.batch.productId === null) continue;
    const packagingNote = packagingText(output.packagingNote);
    if (!packagingNote) continue;
    const packagingNotes = packagingByProduct.get(output.batch.productId) ?? new Map<string, PackagingStat>();
    const current = packagingNotes.get(packagingNote);
    packagingNotes.set(packagingNote, current
      ? { ...current, count: current.count + 1 }
      : {
          count: 1,
          packageUnit: output.packageUnit,
          packagesPerCase: Number(output.packagesPerCase),
          unitsPerPackage: Number(output.unitsPerPackage),
        });
    packagingByProduct.set(output.batch.productId, packagingNotes);
  }
  const naturalText = (left: string, right: string) => left.localeCompare(right, "zh-CN", { numeric: true });
  const unitOrder = (unit: string) => unit === "盒" ? 0 : unit === "瓶" ? 1 : 2;
  const byPackagingStructure = ([leftName, left]: [string, PackagingStat], [rightName, right]: [string, PackagingStat]) =>
    unitOrder(left.packageUnit) - unitOrder(right.packageUnit)
    || left.unitsPerPackage - right.unitsPerPackage
    || left.packagesPerCase - right.packagesPerCase
    || naturalText(leftName, rightName);
  return products.map((product) => {
    const noteEntries = [...(packagingByProduct.get(product.id) ?? new Map<string, PackagingStat>()).entries()];
    const defaultPackagingNote = [...noteEntries]
      .sort((left, right) => right[1].count - left[1].count || byPackagingStructure(left, right))[0]?.[0] ?? "";
    return {
      productId: product.id,
      productName: product.name,
      specification: product.specification ?? "",
      productCode: product.code,
      defaultPackagingNote,
      packagingNotes: noteEntries.sort(byPackagingStructure).map(([note]) => note),
    };
  });
}

export async function listInventoryReceipt(filters: ReceiptListFilters): Promise<InventoryReceiptList> {
  const [outputs, reports, summary, productCatalog] = await Promise.all([
    loadOutputs(filters),
    listReceiptReports(),
    loadReceiptMonthlySummary(filters),
    loadProductCatalog(),
  ]);
  const rows = outputs.map(outputRow).sort(compareReceiptRowsChronologically);
  return {
    rows,
    reports,
    summary,
    years: [...new Set(reports.map((item) => item.year))],
    productCatalog,
    total: rows.length,
    reportCount: reports.length,
    productCatalogCount: productCatalog.length,
    packagingNoteCount: productCatalog.reduce((sum, product) => sum + product.packagingNotes.length, 0),
    auditIssueCount: rows.filter((row) => row.auditStatus === "formula_error").length,
  };
}

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

export async function commitCreateReceiptCommand(command: ReceiptCreateCommand) {
  let result: { ok: true; id: number } | { ok: false; status: number; message: string };
  try {
    result = await runSerializableTransaction(async (tx) => {
    const product = await getActiveFinishedGood(command.productId, tx);
    if (!product) return { ok: false as const, status: 400, message: "产品主数据不存在或已停用" };
    if (!product.specification?.trim()) return { ok: false as const, status: 400, message: "产品主数据缺少规格，不能用于成品入库报单" };
    const report = await tx.inventoryReceiptReport.upsert({
      where: { year_month_workshopName: { year: command.year, month: command.month, workshopName: "固体制剂车间" } },
      create: { year: command.year, month: command.month, workshopName: "固体制剂车间", createdByUserId: command.userId, updatedByUserId: command.userId },
      update: { updatedByUserId: command.userId },
    });
    if (report.status !== "draft") return { ok: false as const, status: 409, message: "该月份汇总已确认，不能继续新增记录" };
    const reusedBatch = command.batchId ? await tx.inventoryReceiptBatch.findUnique({ where: { id: command.batchId } }) : null;
    if (command.batchId && (!reusedBatch || reusedBatch.reportId !== report.id)) throw new Error("批号不属于当前核算月份");
    if (reusedBatch && reusedBatch.productId !== command.productId) return { ok: false as const, status: 400, message: "复用批号与所选产品不一致" };
    const batch = reusedBatch ?? await tx.inventoryReceiptBatch.create({ data: {
      reportId: report.id,
      productId: product.id,
      sortOrder: (await tx.inventoryReceiptBatch.count({ where: { reportId: report.id } })) + 1,
      productName: product.name,
      specification: product.specification,
      batchNumber: command.batchNumber,
      inputQuantityTenThousands: command.inputQuantityTenThousands,
      createdByUserId: command.userId,
      updatedByUserId: command.userId,
    } });
    const existingProductWorkPoint = await tx.inventoryReceiptProductWorkPoint.findFirst({
      where: { reportId: report.id, productId: command.productId },
    });
    if (existingProductWorkPoint && existingProductWorkPoint.version !== command.productWorkPointVersion) {
      return { ok: false as const, status: 409, message: "本月产品工分已被其他人修改，请刷新后重试" };
    }
    if (!existingProductWorkPoint) await tx.inventoryReceiptProductWorkPoint.create({ data: {
      reportId: report.id,
      productId: product.id,
      sortOrder: (await tx.inventoryReceiptProductWorkPoint.count({ where: { reportId: report.id } })) + 1,
      productName: product.name,
      workPoints: command.workPoints,
      createdByUserId: command.userId,
      updatedByUserId: command.userId,
    } });
    const created = await tx.inventoryReceiptOutput.create({ data: {
      batchId: batch.id,
      sortOrder: (await tx.inventoryReceiptOutput.count({ where: { batchId: batch.id } })) + 1,
      productionQuantityText: command.productionQuantityText,
      caseQuantity: command.caseQuantity,
      extraPackageQuantity: command.extraPackageQuantity,
      packagesPerCase: command.packagesPerCase,
      unitsPerPackage: command.unitsPerPackage,
      packageUnit: command.packageUnit,
      packagingNote: command.packagingNote,
      createdByUserId: command.userId,
      updatedByUserId: command.userId,
    } });
    return { ok: true as const, id: created.id };
    });
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    throw error;
  }
  return result.ok ? serviceOk({ success: true, id: result.id }) : serviceError(result.message, result.status);
}

export async function commitUpdateReceiptCommand(command: ReceiptUpdateCommand) {
  let result: { ok: true } | { ok: false; status: number; message: string };
  try {
    result = await runSerializableTransaction(async (tx) => {
      const product = await getActiveFinishedGood(command.productId, tx);
      if (!product) return { ok: false as const, status: 400, message: "产品主数据不存在或已停用" };
      if (!product.specification?.trim()) return { ok: false as const, status: 400, message: "产品主数据缺少规格，不能用于成品入库报单" };
      const current = await tx.inventoryReceiptOutput.findUnique({
        where: { id: command.id },
        include: { batch: { include: { report: true } } },
      });
      if (!current) return { ok: false as const, status: 404, message: "成品入库报单记录不存在" };
      if (current.version !== command.version || current.batch.version !== command.batchVersion) return { ok: false as const, status: 409, message: "当前记录或同批号数据已被修改，请刷新后重试" };
      if (current.batch.report.status !== "draft") return { ok: false as const, status: 409, message: "该月份汇总已确认，不能继续修改记录" };
      if (current.batch.report.year !== command.year || current.batch.report.month !== command.month) return { ok: false as const, status: 400, message: "已建记录不能跨月份移动，请新建后删除原记录" };
      let productWorkPoint = await tx.inventoryReceiptProductWorkPoint.findFirst({
        where: { reportId: current.batch.reportId, productId: command.productId },
      });
      if (productWorkPoint && productWorkPoint.version !== command.productWorkPointVersion) {
        return { ok: false as const, status: 409, message: "本月产品工分已被其他人修改，请刷新后重试" };
      }
      const updateExistingProductWorkPoint = Boolean(productWorkPoint);
      productWorkPoint ??= await tx.inventoryReceiptProductWorkPoint.create({ data: {
        reportId: current.batch.reportId,
        productId: product.id,
        sortOrder: (await tx.inventoryReceiptProductWorkPoint.count({ where: { reportId: current.batch.reportId } })) + 1,
        productName: product.name,
        workPoints: command.workPoints,
        createdByUserId: command.userId,
        updatedByUserId: command.userId,
      } });
      await Promise.all([
        ensureEditHistoryBaseline("InventoryReceiptBatch", current.batchId, command.userId, tx),
        ensureEditHistoryBaseline("InventoryReceiptOutput", command.id, command.userId, tx),
      ]);
      const productChanged = current.batch.productId !== command.productId;
      const remainingOldProductOutputCount = productChanged
        ? await tx.inventoryReceiptOutput.count({
            where: {
              batchId: { not: current.batchId },
              batch: current.batch.productId === null
                ? { reportId: current.batch.reportId, productName: current.batch.productName }
                : { reportId: current.batch.reportId, productId: current.batch.productId },
            },
          })
        : 1;
      await Promise.all([
        tx.inventoryReceiptBatch.update({ where: { id: current.batchId }, data: { productId: product.id, productName: product.name, specification: product.specification, batchNumber: command.batchNumber, inputQuantityTenThousands: command.inputQuantityTenThousands, updatedByUserId: command.userId, version: { increment: 1 } } }),
        tx.inventoryReceiptOutput.update({ where: { id: command.id }, data: { productionQuantityText: command.productionQuantityText, caseQuantity: command.caseQuantity, extraPackageQuantity: command.extraPackageQuantity, packagesPerCase: command.packagesPerCase, unitsPerPackage: command.unitsPerPackage, packageUnit: command.packageUnit, packagingNote: command.packagingNote, updatedByUserId: command.userId, version: { increment: 1 } } }),
        ...(updateExistingProductWorkPoint ? [tx.inventoryReceiptProductWorkPoint.update({ where: { id: productWorkPoint.id }, data: { workPoints: command.workPoints, updatedByUserId: command.userId, version: { increment: 1 } } })] : []),
        ...(remainingOldProductOutputCount === 0 ? [tx.inventoryReceiptProductWorkPoint.deleteMany({
          where: current.batch.productId === null
            ? { reportId: current.batch.reportId, productName: current.batch.productName }
            : { reportId: current.batch.reportId, productId: current.batch.productId },
        })] : []),
      ]);
      await Promise.all([
        snapshotHistory("InventoryReceiptBatch", current.batchId, command.userId, tx),
        snapshotHistory("InventoryReceiptOutput", command.id, command.userId, tx),
      ]);
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    throw error;
  }
  if (!result.ok) return serviceError(result.message, result.status);
  return serviceOk({ success: true });
}

export async function commitDeleteReceiptCommand(command: ReceiptDeleteCommand) {
  const result = await guardedDelete({
    entityType: "InventoryReceiptOutput",
    modelKey: "inventoryReceiptOutput",
    id: command.id,
    userId: command.userId,
    expectedVersion: command.expectedVersion,
    deleteMode: "hard",
    referencePolicy: "none",
    transactionIsolation: "serializable",
    scopeGuard: async ({ id, tx }) => {
      const output = await tx.inventoryReceiptOutput.findUnique({
        where: { id },
        select: { batch: { select: { report: { select: { status: true } } } } },
      });
      return output?.batch.report.status === "draft"
        ? { ok: true as const }
        : { error: "该月份汇总已确认，不能继续删除记录", status: 409 };
    },
    onBeforeDelete: async (id, { tx }) => {
      const output = await tx.inventoryReceiptOutput.findUnique({
        where: { id },
        select: { batch: { select: { reportId: true, productId: true, productName: true } } },
      });
      if (!output) return { error: "成品入库报单记录不存在", status: 404 };
      const remainingProductOutputCount = await tx.inventoryReceiptOutput.count({
        where: {
          id: { not: id },
          batch: output.batch.productId === null
            ? { reportId: output.batch.reportId, productName: output.batch.productName }
            : { reportId: output.batch.reportId, productId: output.batch.productId },
        },
      });
      if (remainingProductOutputCount === 0) {
        await tx.inventoryReceiptProductWorkPoint.deleteMany({
          where: output.batch.productId === null
            ? { reportId: output.batch.reportId, productName: output.batch.productName }
            : { reportId: output.batch.reportId, productId: output.batch.productId },
        });
      }
      return { ok: true as const };
    },
  });
  return result.ok ? serviceOk({ success: true }) : serviceError(result.error, result.status || 400);
}

const createAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "inventory.receipts.record.create",
  validatorKey: "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptCreateCommand",
  commitKey: "packages/inventory/server/receipts/service.commitCreateReceiptCommand",
  validate: (input: CreateInput) => { const result = buildReceiptCreateCommand(input.body, input.userId); return result.ok ? serviceOk(result.data) : validationError(result.issue); },
  commit: commitCreateReceiptCommand,
});
const updateAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "inventory.receipts.record.update",
  validatorKey: "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptUpdateCommand",
  commitKey: "packages/inventory/server/receipts/service.commitUpdateReceiptCommand",
  validate: (input: UpdateInput) => { const result = buildReceiptUpdateCommand(input.id, input.body, input.userId); return result.ok ? serviceOk(result.data) : validationError(result.issue); },
  commit: commitUpdateReceiptCommand,
});
const deleteAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "inventory.receipts.record.delete",
  validatorKey: "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptDeleteCommand",
  commitKey: "packages/inventory/server/receipts/service.commitDeleteReceiptCommand",
  validate: (input: DeleteInput) => { const result = buildReceiptDeleteCommand(input.id, input.userId, input.expectedVersion); return result.ok ? serviceOk(result.data) : validationError(result.issue); },
  commit: commitDeleteReceiptCommand,
});

export function executeCreateReceiptCommand(input: CreateInput) { return executeDirectBusinessActionCommand({ command: createAdapter, input, context: undefined, actorUserId: input.userId }); }
export function executeUpdateReceiptCommand(input: UpdateInput) { return executeDirectBusinessActionCommand({ command: updateAdapter, input, context: undefined, actorUserId: input.userId }); }
export function executeDeleteReceiptCommand(input: DeleteInput) { return executeDirectBusinessActionCommand({ command: deleteAdapter, input, context: undefined, actorUserId: input.userId }); }
