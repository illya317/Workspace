import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  validateInventoryPhysicalCountImport,
  type InventoryPhysicalCountImportInput,
} from "./domain/physical-count-import-validation";

export { validateInventoryPhysicalCountImport } from "./domain/physical-count-import-validation";
export type {
  InventoryPhysicalCountImportInput,
  InventoryPhysicalCountImportLine,
} from "./domain/physical-count-import-validation";

const quantity = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export async function importInventoryPhysicalCount(input: InventoryPhysicalCountImportInput) {
  input = validateInventoryPhysicalCountImport(input);
  const warehouseCode = input.warehouseCode?.trim() || "MAIN";
  const warehouseName = input.warehouseName?.trim() || "主仓库";
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { code: input.companyCode }, select: { id: true } });
    if (!company) throw new Error("目标公司不存在");
    const warehouse = await tx.inventoryWarehouse.upsert({
      where: { companyCode_code: { companyCode: input.companyCode, code: warehouseCode } },
      create: { companyCode: input.companyCode, companyId: company.id, code: warehouseCode, name: warehouseName },
      update: { companyId: company.id, name: warehouseName, status: "active" },
    });
    const itemByCode = new Map<string, number>();
    for (const line of input.lines) {
      if (itemByCode.has(line.itemCode)) continue;
      const existing = await tx.inventoryItem.findUnique({
        where: { companyCode_code: { companyCode: input.companyCode, code: line.itemCode } },
        select: { id: true, name: true, specification: true, baseUnit: true },
      });
      if (existing && (existing.name !== line.itemName || existing.specification !== (line.specification ?? null)
        || existing.baseUnit !== line.baseUnit)) {
        throw new Error(`存货物料编码已绑定不同主数据：${line.itemCode}`);
      }
      const item = existing ?? await tx.inventoryItem.create({ data: {
        companyCode: input.companyCode,
        companyId: company.id,
        code: line.itemCode,
        name: line.itemName,
        itemType: "finished_goods",
        specification: line.specification ?? null,
        baseUnit: line.baseUnit,
        sourceFile: input.sourceFile,
        sourceSheet: input.sourceSheet,
        sourceKey: `${input.sourceSheet}:item:${line.itemCode}`,
        editedBy: input.userId,
      } });
      if (existing) await tx.inventoryItem.update({ where: { id: existing.id }, data: { companyId: company.id } });
      itemByCode.set(line.itemCode, item.id);
    }
    const stocktakeSourceKey = `${input.sourceSheet}:${input.stocktakeDate}`;
    const stocktake = await tx.inventoryStocktake.upsert({
      where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: stocktakeSourceKey } },
      create: {
        companyCode: input.companyCode,
        companyId: company.id,
        stocktakeNo: input.stocktakeNo,
        warehouseId: warehouse.id,
        stocktakeDate: input.stocktakeDate,
        status: "reviewed",
        sourceFile: input.sourceFile,
        sourceSheet: input.sourceSheet,
        sourceKey: stocktakeSourceKey,
        createdBy: input.userId,
      },
      update: { companyId: company.id, stocktakeDate: input.stocktakeDate, status: "reviewed" },
    });
    const expectedDimensions = new Set<string>();
    for (const line of input.lines) {
      const itemId = itemByCode.get(line.itemCode)!;
      const batchNo = line.batchNo?.trim() || null;
      const batch = batchNo ? await tx.inventoryBatch.upsert({
        where: { itemId_warehouseId_batchNo: { itemId, warehouseId: warehouse.id, batchNo } },
        create: { itemId, warehouseId: warehouse.id, batchNo },
        update: {},
      }) : null;
      const dimensionKey = `${itemId}:${warehouse.id}:${batch?.id ?? "none"}`;
      expectedDimensions.add(dimensionKey);
      const existingLine = await tx.inventoryStocktakeLine.findFirst({
        where: { stocktakeId: stocktake.id, itemId, warehouseId: warehouse.id, batchId: batch?.id ?? null },
      });
      const data = {
        bookQuantity: quantity(line.quantity),
        actualQuantity: quantity(line.quantity),
        note: "630物理盘点数量；未从零值总账余额推造计价或收发存移动",
        sourceRow: line.sourceRow,
      };
      if (existingLine) await tx.inventoryStocktakeLine.update({ where: { id: existingLine.id }, data });
      else await tx.inventoryStocktakeLine.create({ data: {
        stocktakeId: stocktake.id,
        itemId,
        warehouseId: warehouse.id,
        batchId: batch?.id ?? null,
        ...data,
      } });
    }
    const storedLines = await tx.inventoryStocktakeLine.findMany({
      where: { stocktakeId: stocktake.id },
      select: { itemId: true, warehouseId: true, batchId: true },
    });
    const stale = storedLines.find((line) => !expectedDimensions.has(`${line.itemId}:${line.warehouseId}:${line.batchId ?? "none"}`));
    if (stale) throw new Error("存货实盘切点存在私有 payload 未声明的历史维度，停止覆盖");
    await tx.inventoryImportBatch.upsert({
      where: { companyCode_checksum_sourceSheet: { companyCode: input.companyCode, checksum: input.sourceSha256, sourceSheet: input.sourceSheet } },
      create: {
        companyCode: input.companyCode,
        companyId: company.id,
        sourceFile: input.sourceFile,
        sourceSheet: input.sourceSheet,
        checksum: input.sourceSha256,
        itemCount: itemByCode.size,
        documentCount: 0,
        rowCount: input.lines.length,
        warningCount: 1,
        importedBy: input.userId,
        note: "仅导入物理盘点数量；630存货总账余额为0，未生成计价期初单据",
      },
      update: { companyId: company.id, itemCount: itemByCode.size, rowCount: input.lines.length, importedBy: input.userId },
    });
    return { companyCode: input.companyCode, stocktakeId: stocktake.id, itemCount: itemByCode.size, lineCount: input.lines.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
