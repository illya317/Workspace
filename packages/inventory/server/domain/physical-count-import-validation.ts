export type InventoryPhysicalCountImportLine = {
  sourceRow: number;
  itemCode: string;
  itemName: string;
  specification?: string | null;
  baseUnit: string;
  batchNo?: string | null;
  quantity: number;
};

export type InventoryPhysicalCountImportInput = {
  companyCode: string;
  sourceFile: string;
  sourceSheet: string;
  sourceSha256: string;
  stocktakeNo: string;
  stocktakeDate: string;
  warehouseCode?: string;
  warehouseName?: string;
  userId?: number;
  lines: InventoryPhysicalCountImportLine[];
};

const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateInventoryPhysicalCountImport(input: InventoryPhysicalCountImportInput) {
  if (!input.companyCode.trim() || !input.sourceFile.trim() || !input.sourceSheet.trim()
    || !input.stocktakeNo.trim() || !DATE.test(input.stocktakeDate)
    || !SHA256.test(input.sourceSha256)) throw new Error("存货实盘切点 scope 或来源摘要无效");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("存货实盘切点至少需要一行");
  const sourceRows = new Set<number>();
  const dimensionKeys = new Set<string>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.sourceRow) || line.sourceRow <= 0 || !line.itemCode.trim()
      || !line.itemName.trim() || !line.baseUnit.trim() || !Number.isFinite(line.quantity) || line.quantity < 0) {
      throw new Error(`存货实盘切点行无效：${line.sourceRow}`);
    }
    if (sourceRows.has(line.sourceRow)) throw new Error(`存货实盘切点来源行重复：${line.sourceRow}`);
    sourceRows.add(line.sourceRow);
    const dimensionKey = `${line.itemCode}:${line.batchNo?.trim() || "none"}`;
    if (dimensionKeys.has(dimensionKey)) throw new Error(`存货实盘切点维度重复：${dimensionKey}`);
    dimensionKeys.add(dimensionKey);
  }
  return input;
}
