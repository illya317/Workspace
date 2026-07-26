import "server-only";

import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  InventoryBatchDto,
  InventoryDocumentDto,
  InventoryImportBatchDto,
  InventoryItemDto,
  InventoryReceiptProductCatalogItem,
  InventoryReceiptReportOption,
  InventoryReceiptRow,
  InventoryStocktakeDto,
  InventoryWarehouseDto,
} from "@workspace/inventory/types";

import {
  INVENTORY_OPERATION_BATCH_FIELDS,
  INVENTORY_OPERATION_DOCUMENT_LINE_FIELDS,
  INVENTORY_OPERATION_DOCUMENT_FIELDS,
  INVENTORY_OPERATION_IMPORT_FIELDS,
  INVENTORY_OPERATION_ITEM_FIELDS,
  INVENTORY_OPERATION_STOCKTAKE_FIELDS,
  INVENTORY_OPERATION_WAREHOUSE_FIELDS,
  INVENTORY_RECEIPT_FIELDS,
  INVENTORY_RECEIPT_PACKAGING_NOTE_FIELDS,
  INVENTORY_RECEIPT_PRODUCT_FIELDS,
  INVENTORY_RECEIPT_REPORT_FIELDS,
  type InventoryDocumentLineAnalysisRow,
  type InventoryReceiptPackagingNoteAnalysisRow,
} from "./workspace-analysis-source-fields";

const PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const LIMITS = {
  maxRows: 4_000,
  maxGroups: 500,
  maxPageSize: 200,
  maxPages: 20,
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const WORKSPACE_SCOPES = {
  personal: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司库存数据，不按个人收窄。" },
  department: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司库存数据，不按部门收窄。" },
  project: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司库存数据，不按项目收窄。" },
} as const;
const OPERATION_PARAMETERS = [
  { key: "companyCode", queryKey: "companyCode", label: "公司编码", description: "库存账套所属公司编码。", kind: "text", required: true },
  { key: "year", queryKey: "year", label: "年份", description: "库存工作区快照年份。", kind: "integer", required: true },
  { key: "month", queryKey: "month", label: "月份", description: "库存工作区快照月份。", kind: "integer", required: true },
] as const;
const RECEIPT_PARAMETERS = [
  { key: "year", queryKey: "year", label: "年份", description: "按入库事实年份筛选。", kind: "integer" },
  { key: "month", queryKey: "month", label: "月份", description: "按入库事实月份筛选。", kind: "integer" },
  { key: "q", queryKey: "q", label: "关键词", description: "按产品、规格或批号搜索入库事实。", kind: "text" },
] as const;

function operationSource<TRow extends object>(input: {
  sourceKey: string;
  label: string;
  description: string;
  rowsPath: string;
  totalPath: string;
  fields: Parameters<ReturnType<typeof defineWorkspaceAnalysisReadModel<TRow>>>[0]["fields"];
}) {
  return defineWorkspaceAnalysisReadModel<TRow>()({
    sourceKey: input.sourceKey,
    version: 1,
    label: input.label,
    description: `${input.description}；来自同一公司、年月的库存工作区快照。`,
    apiPath: "/api/modules/inventory/operations",
    rowsPath: input.rowsPath,
    totalPath: input.totalPath,
    scopes: WORKSPACE_SCOPES,
    parameters: OPERATION_PARAMETERS,
    fields: input.fields,
    pagination: PAGINATION,
    limits: LIMITS,
  });
}

export const INVENTORY_OPERATION_ITEMS_SOURCE = operationSource<InventoryItemDto>({
  sourceKey: "inventory.operations.items",
  label: "库存余额（全公司）",
  description: "以一条存货余额为粒度",
  rowsPath: "items",
  totalPath: "metrics.itemCount",
  fields: INVENTORY_OPERATION_ITEM_FIELDS,
});

export const INVENTORY_OPERATION_WAREHOUSES_SOURCE = operationSource<InventoryWarehouseDto>({
  sourceKey: "inventory.operations.warehouses",
  label: "仓库主数据（全公司）",
  description: "以一个启用仓库为粒度",
  rowsPath: "warehouses",
  totalPath: "metrics.warehouseCount",
  fields: INVENTORY_OPERATION_WAREHOUSE_FIELDS,
});

export const INVENTORY_OPERATION_DOCUMENTS_SOURCE = operationSource<InventoryDocumentDto>({
  sourceKey: "inventory.operations.documents",
  label: "库存单据（全公司）",
  description: "以一张所选月份库存单据为粒度",
  rowsPath: "documents",
  totalPath: "metrics.documentCount",
  fields: INVENTORY_OPERATION_DOCUMENT_FIELDS,
});

export const INVENTORY_OPERATION_DOCUMENT_LINES_SOURCE = operationSource<InventoryDocumentLineAnalysisRow>({
  sourceKey: "inventory.operations.document-lines",
  label: "库存单据明细（全公司）",
  description: "以一条库存单据明细行为粒度，并携带所属单据的稳定标识和业务日期",
  rowsPath: "documents.lines",
  totalPath: "metrics.documentLineCount",
  fields: INVENTORY_OPERATION_DOCUMENT_LINE_FIELDS,
});

export const INVENTORY_OPERATION_BATCHES_SOURCE = operationSource<InventoryBatchDto>({
  sourceKey: "inventory.operations.batches",
  label: "库存批次（全公司）",
  description: "以一个库存批次为粒度，数量截至所选月份末",
  rowsPath: "batches",
  totalPath: "metrics.batchCount",
  fields: INVENTORY_OPERATION_BATCH_FIELDS,
});

export const INVENTORY_OPERATION_STOCKTAKES_SOURCE = operationSource<InventoryStocktakeDto>({
  sourceKey: "inventory.operations.stocktakes",
  label: "盘点差异（全公司）",
  description: "以一条所选月份盘点明细为粒度",
  rowsPath: "stocktakes",
  totalPath: "metrics.stocktakeCount",
  fields: INVENTORY_OPERATION_STOCKTAKE_FIELDS,
});

export const INVENTORY_OPERATION_IMPORTS_SOURCE = operationSource<InventoryImportBatchDto>({
  sourceKey: "inventory.operations.imports",
  label: "库存导入批次（全公司）",
  description: "以一个库存工作簿导入批次为粒度",
  rowsPath: "imports",
  totalPath: "metrics.importCount",
  fields: INVENTORY_OPERATION_IMPORT_FIELDS,
});

export const INVENTORY_RECEIPTS_SOURCE = defineWorkspaceAnalysisReadModel<InventoryReceiptRow>()({
  sourceKey: "inventory.receipts",
  version: 1,
  label: "成品入库事实（全公司）",
  description: "以一条成品入库产出行为粒度，投入量和工分按共享批次、产品月度口径解释。",
  apiPath: "/api/modules/inventory/receipts",
  rowsPath: "rows",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: RECEIPT_PARAMETERS,
  fields: INVENTORY_RECEIPT_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const INVENTORY_RECEIPT_REPORTS_SOURCE = defineWorkspaceAnalysisReadModel<InventoryReceiptReportOption>()({
  sourceKey: "inventory.receipt-reports",
  version: 1,
  label: "成品入库月报（全公司）",
  description: "以一张月度成品入库报单为粒度，展示提交、审核和职责分离事实。",
  apiPath: "/api/modules/inventory/receipts",
  rowsPath: "reports",
  totalPath: "reportCount",
  scopes: WORKSPACE_SCOPES,
  fields: INVENTORY_RECEIPT_REPORT_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const INVENTORY_RECEIPT_PRODUCTS_SOURCE = defineWorkspaceAnalysisReadModel<InventoryReceiptProductCatalogItem>()({
  sourceKey: "inventory.receipt-products",
  version: 1,
  label: "入库产品包装目录（全公司）",
  description: "以一个可用于成品入库的产品为粒度，默认包装按历史使用频次派生。",
  apiPath: "/api/modules/inventory/receipts",
  rowsPath: "productCatalog",
  totalPath: "productCatalogCount",
  scopes: WORKSPACE_SCOPES,
  fields: INVENTORY_RECEIPT_PRODUCT_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const INVENTORY_RECEIPT_PRODUCT_PACKAGING_NOTES_SOURCE = defineWorkspaceAnalysisReadModel<InventoryReceiptPackagingNoteAnalysisRow>()({
  sourceKey: "inventory.receipts.product-packaging-notes",
  version: 1,
  label: "产品历史包装（全公司）",
  description: "以一个产品曾使用过的一条结构化包装说明为粒度，复用成品入库 GET 的产品目录快照。",
  apiPath: "/api/modules/inventory/receipts",
  rowsPath: "productCatalog.packagingNotes",
  totalPath: "packagingNoteCount",
  scopes: WORKSPACE_SCOPES,
  fields: INVENTORY_RECEIPT_PACKAGING_NOTE_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  INVENTORY_OPERATION_ITEMS_SOURCE,
  INVENTORY_OPERATION_WAREHOUSES_SOURCE,
  INVENTORY_OPERATION_DOCUMENTS_SOURCE,
  INVENTORY_OPERATION_DOCUMENT_LINES_SOURCE,
  INVENTORY_OPERATION_BATCHES_SOURCE,
  INVENTORY_OPERATION_STOCKTAKES_SOURCE,
  INVENTORY_OPERATION_IMPORTS_SOURCE,
  INVENTORY_RECEIPTS_SOURCE,
  INVENTORY_RECEIPT_REPORTS_SOURCE,
  INVENTORY_RECEIPT_PRODUCTS_SOURCE,
  INVENTORY_RECEIPT_PRODUCT_PACKAGING_NOTES_SOURCE,
] as const;
