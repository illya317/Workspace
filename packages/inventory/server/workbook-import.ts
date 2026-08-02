import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { calculateMovingWeightedAverage } from "./calculator";
import { buildInventoryWorkbookImportCommand } from "./domain/inventory-validation";

type InventorySourceLine = {
  sheet: string;
  sourceRow: number;
  documentNo: string;
  documentType: "receipt" | "issue";
  documentDate: string;
  itemCode: string;
  itemName: string;
  specification?: string;
  baseUnit: string;
  quantity: number;
  unitPrice?: number;
  batchNo?: string;
  productionDate?: string;
  expiryDate?: string;
  paymentStatus?: string;
  invoiceStatus?: string;
  note?: string;
};

export type ParsedInventoryWorkbook = {
  lines: InventorySourceLine[];
  stocktake: { itemCode: string; itemName: string; unit: string; bookQuantity: number; actualQuantity: number; variance: number; sourceVariance: number };
  checks: { receiptRows: number; issueRows: number; maskVariance: number };
};

const quantity = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const rows = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][];

export function parseInventoryWorkbook(buffer: Buffer): ParsedInventoryWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const receiptRows = rows(workbook, "阿胶浓浆入库明细表").slice(2).filter(hasSequence);
  const issueRows = rows(workbook, "阿胶浓浆出库明细表").slice(2).filter(hasSequence);
  const maskRow = rows(workbook, "面膜")[2];
  const receiptLines = receiptRows.map<InventorySourceLine>((row, index) => {
    const baseUnit = String(row[6]);
    return {
      sheet: "阿胶浓浆入库明细表",
      sourceRow: index + 3,
      documentNo: `RK-${dateKey(row[1]).replaceAll("-", "")}-${String(index + 1).padStart(3, "0")}`,
      documentType: "receipt",
      documentDate: dateKey(row[1]),
      itemCode: baseUnit === "袋" ? "EJIAO-BAG" : "EJIAO-BOX",
      itemName: `${String(row[2])}（${baseUnit}装）`,
      specification: String(row[3] ?? "").trim() || undefined,
      baseUnit,
      quantity: quantity(row[7]),
      unitPrice: money(row[8]),
      batchNo: String(row[10] ?? "").trim() || undefined,
      productionDate: dateKey(row[11]),
      expiryDate: dateKey(row[12]),
      paymentStatus: row[13] ? `入库单：${String(row[13])}` : undefined,
      note: String(row[14] ?? "").trim() || undefined,
    };
  });
  const issueLines = issueRows.map<InventorySourceLine>((row, index) => {
    const paymentAmount = Number(row[15] ?? 0);
    const saleUnitPrice = money(row[8]);
    const sourceNote = String(row[17] ?? "").trim();
    return {
      sheet: "阿胶浓浆出库明细表",
      sourceRow: index + 3,
      documentNo: `CK-${dateKey(row[1]).replaceAll("-", "")}-${String(index + 1).padStart(3, "0")}`,
      documentType: "issue",
      documentDate: dateKey(row[1]),
      itemCode: "EJIAO-BOX",
      itemName: `${String(row[2])}（盒装）`,
      specification: String(row[3] ?? "").trim() || undefined,
      baseUnit: String(row[6]),
      quantity: quantity(row[7]),
      batchNo: String(row[10] ?? "").trim() || undefined,
      productionDate: dateKey(row[11]),
      expiryDate: dateKey(row[12]),
      paymentStatus: paymentAmount ? `${dateKey(row[13])} · ${String(row[14] ?? "")} · 已回款 ${money(paymentAmount)}` : undefined,
      invoiceStatus: String(row[16] ?? "").trim() || undefined,
      note: [sourceNote, `来源销售单价=${saleUnitPrice.toFixed(2)}`].filter(Boolean).join("；"),
    };
  });
  const bookQuantity = quantity(maskRow[8]);
  const actualQuantity = quantity(maskRow[9]);
  const variance = quantity(actualQuantity - bookQuantity);
  const sourceVariance = quantity(maskRow[10]);
  if (Math.abs(variance) !== sourceVariance) throw new Error("面膜盘点差异无法与源表核对");
  return {
    lines: [...receiptLines, ...issueLines],
    stocktake: { itemCode: "MASK-BOX", itemName: String(maskRow[1]), unit: String(maskRow[4]), bookQuantity, actualQuantity, variance, sourceVariance },
    checks: { receiptRows: receiptLines.length, issueRows: issueLines.length, maskVariance: variance },
  };
}

export async function importInventoryWorkbook(input: { buffer: Buffer; sourceFile: string; companyCode: string; userId?: number }) {
  const command = buildInventoryWorkbookImportCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data;
  const parsed = parseInventoryWorkbook(input.buffer);
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { code: input.companyCode }, select: { id: true } });
    if (!company) throw new Error("目标公司不存在");
    await cleanupStaleSourceDocuments(tx, input, parsed);
    const warehouse = await tx.inventoryWarehouse.upsert({ where: { companyCode_code: { companyCode: input.companyCode, code: "MAIN" } }, create: { companyCode: input.companyCode, companyId: company.id, code: "MAIN", name: "主仓库" }, update: { companyId: company.id, name: "主仓库", status: "active" } });
    const itemDefinitions = [
      { code: "MASK-BOX", name: "面膜", specification: null, baseUnit: "盒", sheet: "面膜" },
      { code: "EJIAO-BAG", name: "黄精阿胶浓浆（袋装）", specification: "30ml/袋", baseUnit: "袋", sheet: "阿胶浓浆入库明细表" },
      { code: "EJIAO-BOX", name: "黄精阿胶浓浆（盒装）", specification: "30ml/袋", baseUnit: "盒", sheet: "阿胶浓浆入库明细表" },
    ];
    const itemByCode = new Map<string, number>();
    for (const item of itemDefinitions) {
      const saved = await tx.inventoryItem.upsert({
        where: { companyCode_code: { companyCode: input.companyCode, code: item.code } },
        create: { companyCode: input.companyCode, companyId: company.id, code: item.code, name: item.name, itemType: "finished_goods", specification: item.specification, baseUnit: item.baseUnit, sourceFile: input.sourceFile, sourceSheet: item.sheet, sourceKey: item.code, editedBy: input.userId },
        update: { companyId: company.id, name: item.name, specification: item.specification, baseUnit: item.baseUnit, sourceFile: input.sourceFile, sourceSheet: item.sheet, editedBy: input.userId },
      });
      itemByCode.set(item.code, saved.id);
    }
    await upsertConversion(tx, itemByCode.get("EJIAO-BAG")!, "件", 240);
    await upsertConversion(tx, itemByCode.get("EJIAO-BOX")!, "件", 12);
    for (const line of parsed.lines) {
      const itemId = itemByCode.get(line.itemCode);
      if (!itemId) throw new Error(`物料未创建: ${line.itemCode}`);
      let batchId: number | null = null;
      if (line.batchNo) {
        const batch = await tx.inventoryBatch.upsert({ where: { itemId_warehouseId_batchNo: { itemId, warehouseId: warehouse.id, batchNo: line.batchNo } }, create: { itemId, warehouseId: warehouse.id, batchNo: line.batchNo, productionDate: line.productionDate, expiryDate: line.expiryDate }, update: { productionDate: line.productionDate, expiryDate: line.expiryDate } });
        batchId = batch.id;
      }
      await ensurePostedDocument(tx, { companyCode: input.companyCode, companyId: company.id, sourceFile: input.sourceFile, warehouseId: warehouse.id, itemId, batchId, line, userId: input.userId });
    }
    const stocktake = await tx.inventoryStocktake.upsert({
      where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: "面膜:3" } },
      create: { companyCode: input.companyCode, companyId: company.id, stocktakeNo: "PD-202604-MASK", warehouseId: warehouse.id, stocktakeDate: "2026-04-30", status: "reviewed", sourceFile: input.sourceFile, sourceSheet: "面膜", sourceKey: "面膜:3", createdBy: input.userId },
      update: { companyId: company.id, stocktakeDate: "2026-04-30", status: "reviewed" },
    });
    const existingLine = await tx.inventoryStocktakeLine.findFirst({ where: { stocktakeId: stocktake.id, itemId: itemByCode.get("MASK-BOX")!, warehouseId: warehouse.id, batchId: null } });
    if (existingLine) await tx.inventoryStocktakeLine.update({ where: { id: existingLine.id }, data: { bookQuantity: parsed.stocktake.bookQuantity, actualQuantity: parsed.stocktake.actualQuantity, sourceRow: 3 } });
    else await tx.inventoryStocktakeLine.create({ data: { stocktakeId: stocktake.id, itemId: itemByCode.get("MASK-BOX")!, warehouseId: warehouse.id, bookQuantity: parsed.stocktake.bookQuantity, actualQuantity: parsed.stocktake.actualQuantity, sourceRow: 3 } });
    const sheetCounts = [{ sheet: "面膜", rows: 1, docs: 0 }, { sheet: "阿胶浓浆入库明细表", rows: parsed.checks.receiptRows, docs: parsed.checks.receiptRows }, { sheet: "阿胶浓浆出库明细表", rows: parsed.checks.issueRows, docs: parsed.checks.issueRows }];
    for (const summary of sheetCounts) await tx.inventoryImportBatch.upsert({ where: { companyCode_checksum_sourceSheet: { companyCode: input.companyCode, checksum, sourceSheet: summary.sheet } }, create: { companyCode: input.companyCode, companyId: company.id, sourceFile: input.sourceFile, sourceSheet: summary.sheet, checksum, itemCount: summary.sheet === "面膜" ? 1 : 2, documentCount: summary.docs, rowCount: summary.rows, warningCount: summary.sheet === "面膜" ? 1 : 0, importedBy: input.userId, note: summary.sheet === "面膜" ? "源表盘点差异为绝对值10，系统按实盘-账面记录为-10；630面膜总账余额为0，不伪造计价期初流水" : null }, update: { companyId: company.id, documentCount: summary.docs, rowCount: summary.rows, importedBy: input.userId } });
    return { itemCount: itemDefinitions.length, documentCount: parsed.lines.length, batchCount: await tx.inventoryBatch.count({ where: { item: { companyCode: input.companyCode } } }), stocktakeVariance: parsed.stocktake.variance, checks: parsed.checks };
  });
}

function hasSequence(row: unknown[]) {
  return row[0] !== null && row[0] !== "" && Number.isFinite(Number(row[0]));
}

async function cleanupStaleSourceDocuments(tx: Prisma.TransactionClient, input: { companyCode: string; sourceFile: string }, parsed: ParsedInventoryWorkbook) {
  const validKeys = new Set(parsed.lines.map((line) => `${line.sheet}:${line.sourceRow}`));
  const candidates = await tx.inventoryDocument.findMany({
    where: { companyCode: input.companyCode, sourceFile: input.sourceFile, sourceSheet: { in: ["面膜", "阿胶浓浆入库明细表", "阿胶浓浆出库明细表"] } },
    include: { lines: { select: { id: true } } },
  });
  const stale = candidates.filter((document) => document.sourceKey && !validKeys.has(document.sourceKey));
  const lineIds = stale.flatMap((document) => document.lines.map((line) => line.id));
  if (lineIds.length > 0) await tx.inventoryLedgerEntry.deleteMany({ where: { documentLineId: { in: lineIds } } });
  if (stale.length > 0) await tx.inventoryDocument.deleteMany({ where: { id: { in: stale.map((document) => document.id) } } });
}

async function ensurePostedDocument(tx: Prisma.TransactionClient, input: { companyCode: string; companyId: number; sourceFile: string; warehouseId: number; itemId: number; batchId?: number | null; line: InventorySourceLine; userId?: number }) {
  const sourceKey = `${input.line.sheet}:${input.line.sourceRow}`;
  const existing = await tx.inventoryDocument.findUnique({ where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey } } });
  if (existing) return existing;
  const unitCost = input.line.unitPrice ?? await resolveImportedIssueUnitCost(tx, input);
  const document = await tx.inventoryDocument.create({ data: { companyCode: input.companyCode, companyId: input.companyId, documentNo: input.line.documentNo, documentType: input.line.documentType, documentDate: input.line.documentDate, status: "posted", note: input.line.note, sourceFile: input.sourceFile, sourceSheet: input.line.sheet, sourceKey, createdBy: input.userId, postedBy: input.userId, postedAt: new Date(), lines: { create: { itemId: input.itemId, warehouseId: input.warehouseId, batchId: input.batchId ?? null, quantity: input.line.quantity, unit: input.line.baseUnit, unitFactor: 1, unitPrice: input.line.unitPrice, paymentStatus: input.line.paymentStatus, invoiceStatus: input.line.invoiceStatus, sourceRow: input.line.sourceRow, sourceKey } } }, include: { lines: true } });
  const line = document.lines[0];
  const sign = input.line.documentType === "issue" ? -1 : 1;
  await tx.inventoryLedgerEntry.create({ data: { documentLineId: line.id, companyCode: input.companyCode, companyId: input.companyId, itemId: input.itemId, warehouseId: input.warehouseId, batchId: input.batchId ?? null, movementDate: input.line.documentDate, signedQuantity: sign * input.line.quantity, unitCost } });
  return document;
}

async function resolveImportedIssueUnitCost(
  tx: Prisma.TransactionClient,
  input: { companyCode: string; warehouseId: number; itemId: number; line: InventorySourceLine },
) {
  if (input.line.documentType !== "issue") throw new Error("入库事实缺少来源单位成本");
  const entries = await tx.inventoryLedgerEntry.findMany({
    where: {
      companyCode: input.companyCode,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      movementDate: { lte: input.line.documentDate },
    },
    select: { signedQuantity: true, unitCost: true },
  });
  const unitCost = calculateMovingWeightedAverage(entries.map((entry) => ({
    signedQuantity: Number(entry.signedQuantity),
    unitCost: entry.unitCost == null ? null : Number(entry.unitCost),
  })));
  if (unitCost <= 0) throw new Error(`出库行缺少可计算的移动加权平均成本：${input.line.sheet}:${input.line.sourceRow}`);
  return unitCost;
}

async function upsertConversion(tx: Prisma.TransactionClient, itemId: number, unit: string, factor: number) {
  await tx.inventoryUnitConversion.upsert({ where: { itemId_unit: { itemId, unit } }, create: { itemId, unit, factor }, update: { factor } });
}

function dateKey(value: unknown) {
  if (typeof value === "number") { const parsed = XLSX.SSF.parse_date_code(value); return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : ""; }
  return String(value ?? "").slice(0, 10);
}
