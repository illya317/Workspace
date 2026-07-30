import { prisma } from "@workspace/platform/server/prisma";
import type { CreateInventoryDocumentInput, InventoryWorkspaceDto, LinkInventoryVoucherInput } from "../types";
import { inventoryAccountingAdapter } from "./accounting-adapter";
import { calculateMovingWeightedAverage } from "./calculator";
import { buildCreateInventoryDocumentCommand, buildInventoryDocumentLifecycleCommand, buildLinkInventoryVoucherCommand } from "./domain/inventory-validation";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const quantity = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;

export async function getDefaultInventoryScope() {
  const latest = await prisma.inventoryDocument.findFirst({ orderBy: { documentDate: "desc" }, select: { companyCode: true, documentDate: true } });
  if (!latest) return null;
  return { companyCode: latest.companyCode, year: Number(latest.documentDate.slice(0, 4)), month: Number(latest.documentDate.slice(5, 7)) };
}

export async function createInventoryDocument(input: CreateInventoryDocumentInput, userId: number) {
  const command = buildCreateInventoryDocumentCommand(input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data.input;
  const [items, warehouses, close] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { id: { in: input.lines.map((line) => line.itemId) }, companyCode: input.companyCode }, select: { id: true } }),
    prisma.inventoryWarehouse.findMany({ where: { id: { in: input.lines.map((line) => line.warehouseId) }, companyCode: input.companyCode }, select: { id: true } }),
    prisma.inventoryPeriodClose.findUnique({ where: { companyCode_year_month: { companyCode: input.companyCode, year: Number(input.documentDate.slice(0, 4)), month: Number(input.documentDate.slice(5, 7)) } } }),
  ]);
  if (items.length !== new Set(input.lines.map((line) => line.itemId)).size) throw new Error("物料不存在或不属于当前公司");
  if (warehouses.length !== new Set(input.lines.map((line) => line.warehouseId)).size) throw new Error("仓库不存在或不属于当前公司");
  if (close?.status === "closed") throw new Error("存货期间已关闭，不能新增单据");
  const counterparty = input.counterpartyPartyId
    ? await prisma.party.findUnique({ where: { id: input.counterpartyPartyId }, select: { id: true, name: true } })
    : input.counterparty
      ? await prisma.party.findMany({ where: { name: input.counterparty }, select: { id: true, name: true }, take: 2 }).then((rows) => rows.length === 1 ? rows[0] : null)
      : null;
  if ((input.counterpartyPartyId || input.counterparty) && !counterparty) throw new Error("往来单位必须唯一命中法定主体主数据");
  return prisma.inventoryDocument.create({
    data: {
      companyCode: input.companyCode, documentNo: input.documentNo, documentType: input.documentType, documentDate: input.documentDate, counterparty: counterparty?.name ?? null, counterpartyPartyId: counterparty?.id ?? null, referenceNo: input.referenceNo || null, note: input.note || null, createdBy: userId,
      lines: { create: input.lines.map((line, index) => ({ itemId: line.itemId, warehouseId: line.warehouseId, batchId: line.batchId || null, quantity: line.quantity, unit: line.unit, unitFactor: line.unitFactor ?? 1, unitPrice: line.unitPrice ?? null, sourceKey: `manual:${index + 1}` })) },
    },
    include: { lines: true },
  });
}

export async function applyInventoryDocumentLifecycle(command: { id: number; action: "post" | "reverse"; userId: number }) {
  const validation = buildInventoryDocumentLifecycleCommand(command, command.userId);
  if (!validation.ok) throw new Error(validation.issue.message);
  command = validation.data;
  const document = await loadDocument(command.id);
  if (!document) throw new Error("存货单据不存在");
  if (command.action === "post") return postDocument(document, command.userId);
  return reverseDocument(document, command.userId);
}

export async function linkInventoryClosingVoucher(input: LinkInventoryVoucherInput, userId: number) {
  const command = buildLinkInventoryVoucherCommand(input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data;
  const voucher = await prisma.financeVoucher.findFirst({
    where: { id: input.voucherId, companyCode: input.companyCode, period: { year: input.year, month: input.month } },
    select: { id: true, status: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  if (!voucher) throw new Error("凭证不存在，或不属于当前公司和期间");
  if (voucher.status === "draft") throw new Error("草稿凭证不能用于存货期间结转");
  const proposal = await inventoryAccountingAdapter.getPostingProposal(input);
  for (const line of proposal) {
    const posted = money(voucher.items.filter((item) => item.account.code === line.accountCode).reduce((sum, item) => sum + Number(line.direction === "debit" ? item.debit : item.credit), 0));
    if (Math.abs(posted - line.amount) > 0.01) throw new Error(`凭证科目 ${line.accountCode} 的${line.direction === "debit" ? "借方" : "贷方"}金额与存货计价建议不一致`);
  }
  await inventoryAccountingAdapter.linkVoucher({ companyCode: input.companyCode, year: input.year, month: input.month }, input.voucherId, userId);
  return { linkedVoucherId: input.voucherId, status: "closed" };
}

async function postDocument(document: Awaited<ReturnType<typeof loadDocument>>, userId: number) {
  if (!document || document.status !== "draft") throw new Error("只有草稿单据可以过账");
  const year = Number(document.documentDate.slice(0, 4));
  const month = Number(document.documentDate.slice(5, 7));
  const close = await prisma.inventoryPeriodClose.findUnique({ where: { companyCode_year_month: { companyCode: document.companyCode, year, month } } });
  if (close?.status === "closed") throw new Error("存货期间已关闭");
  const sign = movementSign(document.documentType);
  if (sign < 0) await assertNoNegative(document);
  const unitCosts = await Promise.all(document.lines.map((line) => resolvePostingUnitCost(document, line)));
  return prisma.$transaction(async (tx) => {
    for (let index = 0; index < document.lines.length; index += 1) {
      const line = document.lines[index];
      await tx.inventoryLedgerEntry.create({ data: { documentLineId: line.id, companyCode: document.companyCode, itemId: line.itemId, warehouseId: line.warehouseId, batchId: line.batchId, movementDate: document.documentDate, signedQuantity: sign * Number(line.quantity) * Number(line.unitFactor), unitCost: unitCosts[index] } });
    }
    return tx.inventoryDocument.update({ where: { id: document.id }, data: { status: "posted", postedBy: userId, postedAt: new Date(), version: { increment: 1 } } });
  });
}

async function resolvePostingUnitCost(document: NonNullable<Awaited<ReturnType<typeof loadDocument>>>, line: NonNullable<Awaited<ReturnType<typeof loadDocument>>>["lines"][number]) {
  if (line.unitPrice != null) return money(Number(line.unitPrice) / Number(line.unitFactor));
  const entries = await prisma.inventoryLedgerEntry.findMany({
    where: { companyCode: document.companyCode, itemId: line.itemId, warehouseId: line.warehouseId, movementDate: { lte: document.documentDate } },
    select: { signedQuantity: true, unitCost: true },
  });
  return calculateMovingWeightedAverage(entries.map((entry) => ({ signedQuantity: Number(entry.signedQuantity), unitCost: entry.unitCost == null ? null : Number(entry.unitCost) })));
}

async function reverseDocument(document: Awaited<ReturnType<typeof loadDocument>>, userId: number) {
  if (!document || document.status !== "posted") throw new Error("只有已过账单据可以冲销");
  const originalEntries = await prisma.inventoryLedgerEntry.findMany({ where: { documentLineId: { in: document.lines.map((line) => line.id) } } });
  return prisma.$transaction(async (tx) => {
    const reversal = await tx.inventoryDocument.create({
      data: { companyCode: document.companyCode, documentNo: `${document.documentNo}-R`, documentType: document.documentType, documentDate: document.documentDate, status: "posted", counterparty: document.counterparty, counterpartyPartyId: document.counterpartyPartyId, referenceNo: document.documentNo, note: `冲销 ${document.documentNo}`, createdBy: userId, postedBy: userId, postedAt: new Date(), lines: { create: document.lines.map((line, index) => ({ itemId: line.itemId, warehouseId: line.warehouseId, batchId: line.batchId, quantity: line.quantity, unit: line.unit, unitFactor: line.unitFactor, unitPrice: line.unitPrice, sourceKey: `reversal:${index + 1}` })) } },
      include: { lines: true },
    });
    for (let index = 0; index < reversal.lines.length; index += 1) {
      const original = originalEntries.find((entry) => entry.documentLineId === document.lines[index]?.id);
      if (!original) throw new Error("原单据流水不完整");
      await tx.inventoryLedgerEntry.create({ data: { documentLineId: reversal.lines[index].id, companyCode: document.companyCode, itemId: original.itemId, warehouseId: original.warehouseId, batchId: original.batchId, movementDate: document.documentDate, signedQuantity: -Number(original.signedQuantity), unitCost: original.unitCost } });
    }
    await tx.inventoryDocument.update({ where: { id: document.id }, data: { status: "reversed", reversedById: reversal.id, version: { increment: 1 } } });
    return reversal;
  });
}

function loadDocument(id: number) {
  return prisma.inventoryDocument.findUnique({ where: { id }, include: { lines: true } });
}

async function assertNoNegative(document: NonNullable<Awaited<ReturnType<typeof loadDocument>>>) {
  for (const line of document.lines) {
    const aggregate = await prisma.inventoryLedgerEntry.aggregate({ where: { companyCode: document.companyCode, itemId: line.itemId, warehouseId: line.warehouseId, batchId: line.batchId, movementDate: { lte: document.documentDate } }, _sum: { signedQuantity: true } });
    const available = Number(aggregate._sum.signedQuantity ?? 0);
    const required = Number(line.quantity) * Number(line.unitFactor);
    if (available < required) throw new Error(`库存不足：物料 ${line.itemId} 可用 ${available}，需要 ${required}`);
  }
}

function movementSign(type: string) {
  if (type === "receipt") return 1;
  if (type === "issue") return -1;
  if (type === "adjustment") return 1;
  throw new Error("调拨单必须通过成对调入/调出接口过账");
}

export async function listInventoryWorkspace(scope: { companyCode: string; year: number; month: number }): Promise<InventoryWorkspaceDto> {
  const startDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
  const endDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-31`;
  const nearExpiryDate = new Date(Date.UTC(scope.year, scope.month + 3, 0)).toISOString().slice(0, 10);
  const [items, warehouses, documents, batches, stocktakes, imports, close, monthEntries, snapshot, postingProposal] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { companyCode: scope.companyCode }, include: { ledgerEntries: { where: { movementDate: { lte: endDate } }, select: { signedQuantity: true } }, batches: { select: { id: true } } }, orderBy: { code: "asc" } }),
    prisma.inventoryWarehouse.findMany({ where: { companyCode: scope.companyCode, status: "active" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.inventoryDocument.findMany({ where: { companyCode: scope.companyCode, documentDate: { gte: startDate, lte: endDate } }, include: { lines: { include: { item: true, warehouse: true, batch: true } } }, orderBy: [{ documentDate: "desc" }, { documentNo: "desc" }] }),
    prisma.inventoryBatch.findMany({ where: { item: { companyCode: scope.companyCode } }, include: { item: true, warehouse: true, ledgerEntries: { where: { movementDate: { lte: endDate } }, select: { signedQuantity: true } } }, orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }] }),
    prisma.inventoryStocktake.findMany({ where: { companyCode: scope.companyCode, stocktakeDate: { gte: startDate, lte: endDate } }, include: { warehouse: true, lines: { include: { item: true } } }, orderBy: { stocktakeDate: "desc" } }),
    prisma.inventoryImportBatch.findMany({ where: { companyCode: scope.companyCode }, orderBy: { importedAt: "desc" } }),
    prisma.inventoryPeriodClose.findUnique({ where: { companyCode_year_month: scope } }),
    prisma.inventoryLedgerEntry.findMany({ where: { companyCode: scope.companyCode, movementDate: { gte: startDate, lte: endDate } }, select: { signedQuantity: true } }),
    inventoryAccountingAdapter.getValuationSnapshot(scope),
    inventoryAccountingAdapter.getPostingProposal(scope),
  ]);
  const itemDtos = items.map((item) => {
    const onHand = quantity(item.ledgerEntries.reduce((sum, entry) => sum + Number(entry.signedQuantity), 0));
    return { id: item.id, companyCode: item.companyCode, code: item.code, name: item.name, itemType: item.itemType, specification: item.specification, baseUnit: item.baseUnit, status: item.status, onHand, available: onHand, batchCount: item.batches.length, sourceSheet: item.sourceSheet };
  });
  const documentDtos = documents.map((document) => ({
    id: document.id, documentNo: document.documentNo, documentType: document.documentType, documentDate: document.documentDate, status: document.status, counterparty: document.counterparty, referenceNo: document.referenceNo, lineCount: document.lines.length,
    quantity: quantity(document.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitFactor), 0)),
    amount: money(document.lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice ?? 0), 0)), sourceSheet: document.sourceSheet,
    lines: document.lines.map((line) => ({ id: line.id, itemCode: line.item.code, itemName: line.item.name, warehouseName: line.warehouse.name, batchNo: line.batch?.batchNo ?? null, quantity: quantity(line.quantity), unit: line.unit, baseQuantity: quantity(Number(line.quantity) * Number(line.unitFactor)), unitPrice: line.unitPrice == null ? null : money(line.unitPrice), amount: line.unitPrice == null ? null : money(Number(line.quantity) * Number(line.unitPrice)), paymentStatus: line.paymentStatus, invoiceStatus: line.invoiceStatus })),
  }));
  const batchDtos = batches.map((batch) => ({ id: batch.id, itemCode: batch.item.code, itemName: batch.item.name, warehouseName: batch.warehouse.name, batchNo: batch.batchNo, productionDate: batch.productionDate, expiryDate: batch.expiryDate, status: batch.expiryDate && batch.expiryDate <= nearExpiryDate ? "near_expiry" : batch.status, onHand: quantity(batch.ledgerEntries.reduce((sum, entry) => sum + Number(entry.signedQuantity), 0)) }));
  const stocktakeDtos = stocktakes.flatMap((stocktake) => stocktake.lines.map((line) => {
    const variance = quantity(Number(line.actualQuantity) - Number(line.bookQuantity));
    return { id: line.id, stocktakeNo: stocktake.stocktakeNo, stocktakeDate: stocktake.stocktakeDate, warehouseName: stocktake.warehouse.name, status: stocktake.status, itemCode: line.item.code, itemName: line.item.name, bookQuantity: quantity(line.bookQuantity), actualQuantity: quantity(line.actualQuantity), variance, varianceLabel: variance < 0 ? `盘亏 ${Math.abs(variance)}` : variance > 0 ? `盘盈 ${variance}` : "账实相符" };
  }));
  const receiptQuantity = quantity(monthEntries.filter((entry) => Number(entry.signedQuantity) > 0).reduce((sum, entry) => sum + Number(entry.signedQuantity), 0));
  const issueQuantity = quantity(Math.abs(monthEntries.filter((entry) => Number(entry.signedQuantity) < 0).reduce((sum, entry) => sum + Number(entry.signedQuantity), 0)));
  return {
    scope,
    warehouses,
    items: itemDtos,
    documents: documentDtos,
    batches: batchDtos,
    stocktakes: stocktakeDtos,
    imports: imports.map((item) => ({ id: item.id, sourceFile: item.sourceFile, sourceSheet: item.sourceSheet, status: item.status, itemCount: item.itemCount, documentCount: item.documentCount, rowCount: item.rowCount, warningCount: item.warningCount, importedAt: item.importedAt.toISOString() })),
    closing: { status: close?.status ?? "open", inventoryValue: snapshot.inventoryValue, onHandQuantity: snapshot.onHandQuantity, linkedVoucherId: close?.voucherId ?? null, postingProposal },
    metrics: {
      itemCount: itemDtos.length,
      warehouseCount: warehouses.length,
      documentCount: documentDtos.length,
      documentLineCount: documentDtos.reduce((sum, document) => sum + document.lines.length, 0),
      batchCount: batchDtos.length,
      stocktakeCount: stocktakeDtos.length,
      importCount: imports.length,
      onHandQuantity: snapshot.onHandQuantity,
      receiptQuantity,
      issueQuantity,
      nearExpiryBatchCount: batchDtos.filter((batch) => batch.status === "near_expiry" && batch.onHand > 0).length,
      stocktakeVariance: quantity(stocktakeDtos.reduce((sum, item) => sum + item.variance, 0)),
    },
  };
}
