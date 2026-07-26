import type {
  WorkspaceAnalysisReadModelField,
  WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  InventoryBatchDto,
  InventoryDocumentLineDto,
  InventoryDocumentDto,
  InventoryImportBatchDto,
  InventoryItemDto,
  InventoryReceiptProductCatalogItem,
  InventoryReceiptReportOption,
  InventoryReceiptRow,
  InventoryStocktakeDto,
  InventoryWarehouseDto,
} from "@workspace/inventory/types";

type Sensitivity = WorkspaceAnalysisReadModelField["sensitivity"];

function field(input: Omit<WorkspaceAnalysisReadModelField, "classification">): WorkspaceAnalysisReadModelField {
  return { classification: "field", ...input };
}

function text(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({ label, description, valueKind: "text", sensitivity, exportPolicy: "allowed" });
}

function integer(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({
    label,
    description,
    valueKind: "integer",
    sensitivity,
    exportPolicy: "allowed",
    capabilities: {
      filterOperators: ["equals", "in", "range"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    },
  });
}

function number(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({ label, description, valueKind: "number", sensitivity, exportPolicy: "allowed" });
}

function repeatedNumber(label: string, description: string) {
  return field({
    label,
    description,
    valueKind: "number",
    sensitivity: "internal",
    exportPolicy: "allowed",
    capabilities: {
      filterOperators: ["equals", "range"],
      groupable: false,
      aggregateOperations: ["count", "distinctCount"],
    },
  });
}

function currency(label: string, description: string) {
  return field({ label, description, valueKind: "currency", sensitivity: "confidential", exportPolicy: "allowed" });
}

function unitCurrency(label: string, description: string) {
  return field({
    label,
    description,
    valueKind: "currency",
    sensitivity: "confidential",
    exportPolicy: "allowed",
    capabilities: {
      filterOperators: ["equals", "range"],
      groupable: false,
      aggregateOperations: ["count", "distinctCount", "average", "min", "max"],
    },
  });
}

function date(label: string, description: string) {
  return field({ label, description, valueKind: "date", sensitivity: "internal", exportPolicy: "allowed" });
}

function boolean(label: string, description: string) {
  return field({ label, description, valueKind: "boolean", sensitivity: "internal", exportPolicy: "allowed" });
}

export type InventoryDocumentLineAnalysisRow = InventoryDocumentLineDto & {
  documentId: number;
  documentNo: string;
  documentType: string;
  documentDate: string;
  documentStatus: string;
};

export type InventoryReceiptPackagingNoteAnalysisRow = Omit<InventoryReceiptProductCatalogItem, "packagingNotes"> & {
  packagingNote: string;
};

export const INVENTORY_OPERATION_ITEM_FIELDS = {
  id: integer("存货 ID", "存货主数据的稳定标识。"),
  companyCode: text("公司编码", "存货所属公司编码。"),
  code: text("存货编码", "存货业务编码。"),
  name: text("存货名称", "存货业务名称。"),
  itemType: text("存货类型", "原料、在制品或产成品等存货类型。"),
  specification: text("规格型号", "存货规格型号。"),
  baseUnit: text("基本单位", "库存计量基本单位。"),
  status: text("状态", "存货主数据状态。"),
  onHand: number("在手数量", "截至所选期间末的库存数量。"),
  available: number("可用数量", "当前实现与在手数量一致的可用数量。"),
  batchCount: integer("批次数", "存货关联的批次数量。"),
  sourceSheet: text("来源工作表", "导入主数据的来源工作表。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryItemDto>;

export const INVENTORY_OPERATION_WAREHOUSE_FIELDS = {
  id: integer("仓库 ID", "仓库主数据的稳定标识。"),
  code: text("仓库编码", "仓库业务编码。"),
  name: text("仓库名称", "仓库业务名称。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryWarehouseDto>;

export const INVENTORY_OPERATION_DOCUMENT_FIELDS = {
  id: integer("单据 ID", "库存单据的稳定标识。"),
  documentNo: text("单据号", "库存单据业务编号。"),
  documentType: text("单据类型", "收货、发货、调整或调拨等单据类型。"),
  documentDate: date("单据日期", "库存单据业务日期。"),
  status: text("单据状态", "草稿、已过账或已冲销状态。"),
  counterparty: text("往来单位", "库存单据往来单位快照。", "confidential"),
  referenceNo: text("来源单号", "外部或上游业务来源单号。"),
  lineCount: integer("明细行数", "单据包含的明细行数量。"),
  quantity: number("单据数量", "单据明细按基本数量汇总。"),
  amount: currency("单据金额", "单据明细按来源单价汇总，缺失单价按零计入现有口径。"),
  sourceSheet: text("来源工作表", "导入单据的来源工作表。"),
  lines: {
    classification: "childSource",
    sourceKey: "inventory.operations.document-lines",
    description: "单据明细由 inventory.operations.document-lines 稳定展开并独立分页。",
  },
} satisfies WorkspaceAnalysisReadModelFields<InventoryDocumentDto>;

export const INVENTORY_OPERATION_DOCUMENT_LINE_FIELDS = {
  documentId: integer("单据 ID", "明细所属库存单据的稳定标识。"),
  documentNo: text("单据号", "明细所属库存单据业务编号。"),
  documentType: text("单据类型", "明细所属库存单据类型。"),
  documentDate: date("单据日期", "明细所属库存单据业务日期。"),
  documentStatus: text("单据状态", "明细所属库存单据状态。"),
  id: integer("明细行 ID", "库存单据明细行的稳定标识。"),
  itemCode: text("存货编码", "明细关联存货编码。"),
  itemName: text("存货名称", "明细关联存货名称。"),
  warehouseName: text("仓库", "明细关联仓库名称。"),
  batchNo: text("批号", "明细关联库存批号。"),
  quantity: number("业务数量", "单据行按业务单位记录的数量。"),
  unit: text("业务单位", "单据行数量单位。"),
  baseQuantity: number("基本数量", "业务数量按单位换算系数折算后的基本数量。"),
  unitPrice: unitCurrency("单价", "来源单价；来源未提供时为空，属于非加总指标。"),
  amount: currency("金额", "业务数量乘来源单价；来源未提供单价时为空。"),
  paymentStatus: text("付款状态", "来源工作簿记录的付款状态。", "confidential"),
  invoiceStatus: text("发票状态", "来源工作簿记录的发票状态。", "confidential"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryDocumentLineAnalysisRow>;

export const INVENTORY_OPERATION_BATCH_FIELDS = {
  id: integer("批次 ID", "库存批次的稳定标识。"),
  itemCode: text("存货编码", "批次所属存货编码。"),
  itemName: text("存货名称", "批次所属存货名称。"),
  warehouseName: text("仓库", "批次所在仓库名称。"),
  batchNo: text("批号", "库存业务批号。"),
  productionDate: date("生产日期", "批次生产日期。"),
  expiryDate: date("失效日期", "批次失效日期。"),
  status: text("批次状态", "批次状态；临期状态按所选期间动态派生。"),
  onHand: number("在手数量", "截至所选期间末的批次库存数量。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryBatchDto>;

export const INVENTORY_OPERATION_STOCKTAKE_FIELDS = {
  id: integer("盘点行 ID", "盘点明细行的稳定标识。"),
  stocktakeNo: text("盘点单号", "盘点业务编号。"),
  stocktakeDate: date("盘点日期", "实际盘点日期。"),
  warehouseName: text("仓库", "盘点仓库名称。"),
  status: text("盘点状态", "盘点业务状态。"),
  itemCode: text("存货编码", "盘点存货编码。"),
  itemName: text("存货名称", "盘点存货名称。"),
  bookQuantity: number("账面数量", "盘点时账面库存数量。"),
  actualQuantity: number("实盘数量", "盘点实际数量。"),
  variance: number("盘点差异", "实盘数量减账面数量。"),
  varianceLabel: text("差异说明", "盘盈、盘亏或账实相符的展示说明。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryStocktakeDto>;

export const INVENTORY_OPERATION_IMPORT_FIELDS = {
  id: integer("导入批次 ID", "库存工作簿导入批次的稳定标识。"),
  sourceFile: text("来源文件", "导入来源文件名。"),
  sourceSheet: text("来源工作表", "导入来源工作表。"),
  status: text("导入状态", "导入批次处理状态。"),
  itemCount: integer("存货数", "本批次处理的存货数量。"),
  documentCount: integer("单据数", "本批次处理的单据数量。"),
  rowCount: integer("来源行数", "本批次处理的来源行数量。"),
  warningCount: integer("警告数", "本批次产生的导入警告数量。"),
  importedAt: date("导入时间", "批次导入完成时间。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryImportBatchDto>;

export const INVENTORY_RECEIPT_FIELDS = {
  id: integer("产出行 ID", "成品入库产出行的稳定标识。"),
  version: integer("产出行版本", "用于并发控制的产出行版本。"),
  reportId: integer("月报 ID", "所属月度入库报单标识。"),
  batchId: integer("批次 ID", "所属生产批次标识。"),
  batchVersion: integer("批次版本", "用于并发控制的生产批次版本。"),
  productId: integer("产品 ID", "已关联产品主数据标识；未关联时为空。"),
  productWorkPointId: integer("产品工分 ID", "月度产品工分记录标识；未建立时为空。"),
  productWorkPointVersion: integer("产品工分版本", "产品工分记录并发版本；未建立时为空。"),
  workPoints: repeatedNumber("工分", "产品月度工分会在同产品的多条产出行重复；可展示和筛选，不可直接求和。"),
  year: integer("年份", "入库事实所属年份。"),
  month: integer("月份", "入库事实所属月份。"),
  productName: text("产品名称", "入库来源产品名称快照。"),
  specification: text("规格型号", "入库来源规格型号快照。"),
  batchNumber: text("批号", "生产批号。"),
  inputQuantityTenThousands: repeatedNumber("投入量（万）", "同批次投入量会在该批次的多条产出行重复；可展示和筛选，不可直接求和。"),
  productionQuantityText: text("生产数量原文", "来源记录的生产数量文本。"),
  caseQuantity: number("箱数", "结构化整箱数量。"),
  extraPackageQuantity: number("尾数", "不足整箱的包装数量。"),
  packagesPerCase: integer("每箱包装数", "每箱包含的包装数量。"),
  unitsPerPackage: integer("每包装单位数", "每包装包含的最小单位数量。"),
  packageUnit: text("包装单位", "盒、瓶等包装单位。"),
  packagingNote: text("包装说明", "结构化包装规格说明。"),
  convertedPackages: number("折算包装数", "服务按箱数、尾数及每箱包装数计算。"),
  convertedTenThousands: number("折算万单位", "服务按折算包装数和每包装单位数计算。"),
  sourceConvertedPackages: number("来源折算包装数", "工作簿原始折算结果，仅用于核对。"),
  sourceConvertedTenThousands: number("来源折算万单位", "工作簿原始折算结果，仅用于核对。"),
  sourceConvertedPackagesFormula: text("来源包装数公式", "工作簿中的原始折算公式文本。"),
  sourceConvertedTenThousandsFormula: text("来源万单位公式", "工作簿中的原始折算公式文本。"),
  auditStatus: text("核对状态", "结构化重算与来源结果的核对状态。"),
  auditNote: text("核对说明", "折算核对差异说明。"),
  sourceFile: text("来源文件", "入库事实来源文件名。"),
  sourceSheet: text("来源工作表", "入库事实来源工作表。"),
  sourceRow: integer("来源行号", "入库事实在来源表中的行号。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryReceiptRow>;

export const INVENTORY_RECEIPT_REPORT_FIELDS = {
  id: integer("月报 ID", "月度入库报单的稳定标识。"),
  version: integer("月报版本", "用于并发控制的月报版本。"),
  year: integer("年份", "月报所属年份。"),
  month: integer("月份", "月报所属月份。"),
  workshopName: text("车间", "月报所属生产车间。"),
  status: text("状态", "草稿、已提交或已审核状态。"),
  preparedBy: text("制表人", "月报确认时固化的制表人。", "confidential"),
  preparedByUserId: integer("制表账号 ID", "月报制表账号标识。", "confidential"),
  preparedAt: date("制表时间", "月报提交时间。"),
  reviewedBy: text("审核人", "月报审核人。", "confidential"),
  reviewedByUserId: integer("审核账号 ID", "月报审核账号标识。", "confidential"),
  reviewedAt: date("审核时间", "月报审核完成时间。"),
  canEdit: boolean("可编辑", "当前月报状态是否允许继续编辑。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryReceiptReportOption>;

export const INVENTORY_RECEIPT_PRODUCT_FIELDS = {
  productId: integer("产品 ID", "产品主数据稳定标识。"),
  productName: text("产品名称", "产品主数据名称。"),
  specification: text("规格型号", "产品主数据规格。"),
  productCode: text("产品编码", "产品主数据编码。"),
  defaultPackagingNote: text("默认包装", "按历史使用频次派生的默认包装说明。"),
  packagingNotes: {
    classification: "childSource",
    sourceKey: "inventory.receipts.product-packaging-notes",
    description: "历史包装说明由 inventory.receipts.product-packaging-notes 稳定展开并独立分页。",
  },
} satisfies WorkspaceAnalysisReadModelFields<InventoryReceiptProductCatalogItem>;

export const INVENTORY_RECEIPT_PACKAGING_NOTE_FIELDS = {
  productId: integer("产品 ID", "产品主数据稳定标识。"),
  productName: text("产品名称", "产品主数据名称。"),
  specification: text("规格型号", "产品主数据规格。"),
  productCode: text("产品编码", "产品主数据编码。"),
  defaultPackagingNote: text("默认包装", "按历史使用频次派生的默认包装说明。"),
  packagingNote: text("历史包装", "该产品在成品入库事实中使用过的结构化包装说明。"),
} satisfies WorkspaceAnalysisReadModelFields<InventoryReceiptPackagingNoteAnalysisRow>;
