import type { CreateSurfaceSectionSpec, DataSurfaceColumnSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { CreateInventoryDocumentInput, InventoryBatchDto, InventoryDocumentDto, InventoryImportBatchDto, InventoryItemDto, InventoryStocktakeDto, InventoryWorkspaceDto } from "../types";

export const documentTypeLabels: Record<string, string> = { receipt: "入库", issue: "出库", adjustment: "调整", transfer: "调拨" };
export const statusLabels: Record<string, string> = { draft: "草稿", posted: "已过账", reversed: "已冲销", open: "开放", closed: "已结转", active: "启用", completed: "已完成", reviewed: "已复核" };
const amount = (value: number) => ({ kind: "amount" as const, value, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => ({ kind: "number" as const, value, maximumFractionDigits: 6 });
const badge = (value: string) => ({ kind: "badge" as const, label: statusLabels[value] ?? value, tone: value === "posted" || value === "completed" || value === "active" ? "green" as const : value === "reversed" ? "red" as const : "gray" as const });

export const itemColumns: DataSurfaceColumnSpec<InventoryItemDto>[] = [
  { key: "code", label: "SKU 编码", required: true, font: "mono", cell: (row) => row.code },
  { key: "name", label: "产品名称", required: true, cell: (row) => row.name },
  { key: "spec", label: "规格", cell: (row) => row.specification || "—" },
  { key: "type", label: "分类", cell: (row) => row.itemType },
  { key: "onHand", label: "账面库存", required: true, align: "right", cell: (row) => ({ kind: "group", items: [number(row.onHand), { kind: "text", value: row.baseUnit, tone: "muted" }] }) },
  { key: "batches", label: "批次数", align: "right", cell: (row) => number(row.batchCount) },
  { key: "status", label: "状态", cell: (row) => badge(row.status) },
];

export const documentColumns: DataSurfaceColumnSpec<InventoryDocumentDto>[] = [
  { key: "no", label: "单据号", required: true, font: "mono", cell: (row) => row.documentNo },
  { key: "date", label: "日期", cell: (row) => row.documentDate },
  { key: "type", label: "类型", cell: (row) => documentTypeLabels[row.documentType] ?? row.documentType },
  { key: "counterparty", label: "往来单位/用途", cell: (row) => row.counterparty || "—" },
  { key: "quantity", label: "基础数量", align: "right", cell: (row) => number(row.quantity) },
  { key: "amount", label: "来源金额", align: "right", cell: (row) => amount(row.amount) },
  { key: "status", label: "状态", required: true, cell: (row) => badge(row.status) },
  { key: "source", label: "来源", cell: (row) => row.sourceSheet || "手工" },
];

export const batchColumns: DataSurfaceColumnSpec<InventoryBatchDto>[] = [
  { key: "item", label: "物料", required: true, cell: (row) => `${row.itemCode} · ${row.itemName}` },
  { key: "batch", label: "批号", required: true, font: "mono", cell: (row) => row.batchNo },
  { key: "warehouse", label: "仓库", cell: (row) => row.warehouseName },
  { key: "production", label: "生产日期", cell: (row) => row.productionDate || "—" },
  { key: "expiry", label: "有效期", cell: (row) => row.expiryDate || "—" },
  { key: "onHand", label: "批次结存", align: "right", cell: (row) => number(row.onHand) },
  { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.status === "near_expiry" ? "临期" : statusLabels[row.status] ?? row.status, tone: row.status === "near_expiry" ? "amber" : "green" }) },
];

export const stocktakeColumns: DataSurfaceColumnSpec<InventoryStocktakeDto>[] = [
  { key: "no", label: "盘点单", required: true, font: "mono", cell: (row) => row.stocktakeNo },
  { key: "date", label: "盘点日", cell: (row) => row.stocktakeDate },
  { key: "item", label: "物料", required: true, cell: (row) => `${row.itemCode} · ${row.itemName}` },
  { key: "warehouse", label: "仓库", cell: (row) => row.warehouseName },
  { key: "book", label: "账面", align: "right", cell: (row) => number(row.bookQuantity) },
  { key: "actual", label: "实盘", align: "right", cell: (row) => number(row.actualQuantity) },
  { key: "variance", label: "差异", required: true, align: "right", cell: (row) => ({ kind: "badge", label: row.varianceLabel, tone: row.variance === 0 ? "green" : "red" }) },
  { key: "status", label: "状态", cell: (row) => badge(row.status) },
];

export const importColumns: DataSurfaceColumnSpec<InventoryImportBatchDto>[] = [
  { key: "file", label: "来源文件", required: true, cell: (row) => row.sourceFile },
  { key: "sheet", label: "工作表", cell: (row) => row.sourceSheet || "—" },
  { key: "items", label: "物料", align: "right", cell: (row) => number(row.itemCount) },
  { key: "documents", label: "单据", align: "right", cell: (row) => number(row.documentCount) },
  { key: "rows", label: "来源行", align: "right", cell: (row) => number(row.rowCount) },
  { key: "warnings", label: "警告", align: "right", cell: (row) => ({ kind: "badge", label: String(row.warningCount), tone: row.warningCount ? "amber" : "green" }) },
  { key: "status", label: "状态", cell: (row) => badge(row.status) },
];

export const postingColumns: DataSurfaceColumnSpec<InventoryWorkspaceDto["closing"]["postingProposal"][number]>[] = [
  { key: "account", label: "科目", required: true, font: "mono", cell: (row) => row.accountCode },
  { key: "direction", label: "方向", cell: (row) => row.direction === "debit" ? "借" : "贷" },
  { key: "amount", label: "建议金额", align: "right", required: true, cell: (row) => amount(row.amount) },
  { key: "description", label: "摘要", required: true, cell: (row) => row.description },
];

export function emptyDocumentDraft(companyCode: string, date: string, item?: InventoryItemDto, warehouse?: InventoryWorkspaceDto["warehouses"][number]): CreateInventoryDocumentInput {
  return { companyCode, documentNo: `INV-${date.replaceAll("-", "")}-`, documentType: "receipt", documentDate: date, counterparty: null, referenceNo: null, note: null, lines: [{ itemId: item?.id ?? 0, warehouseId: warehouse?.id ?? 0, quantity: 1, unit: item?.baseUnit ?? "盒", unitFactor: 1, unitPrice: null }] };
}

export function documentFormSections(draft: CreateInventoryDocumentInput, workspace: InventoryWorkspaceDto | null, onChange: (draft: CreateInventoryDocumentInput) => void): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const line = draft.lines[0];
  const set = (key: keyof CreateInventoryDocumentInput, value: unknown) => onChange({ ...draft, [key]: value });
  const setLine = (key: keyof CreateInventoryDocumentInput["lines"][number], value: unknown) => onChange({ ...draft, lines: [{ ...line, [key]: value }] });
  return [
    { key: "header", title: "单据头", layout: { columns: 3, density: "compact" }, items: [
      { key: "documentNo", label: "单据号", required: true, spec: { valueType: "string", control: "text", validation: { required: true } }, value: draft.documentNo, onChange: (value) => set("documentNo", String(value ?? "")) },
      { key: "documentType", label: "单据类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "receipt", label: "入库" }, { value: "issue", label: "出库" }, { value: "adjustment", label: "调整" }] } }, value: draft.documentType, onChange: (value) => set("documentType", String(value)) },
      { key: "documentDate", label: "单据日期", required: true, spec: { valueType: "date", control: "temporal", precision: "date" }, value: draft.documentDate, onChange: (value) => set("documentDate", String(value ?? "")) },
      { key: "counterparty", label: "往来单位/用途", spec: { valueType: "string", control: "text" }, value: draft.counterparty ?? "", onChange: (value) => set("counterparty", String(value ?? "")) },
      { key: "referenceNo", label: "来源单号", spec: { valueType: "string", control: "text" }, value: draft.referenceNo ?? "", onChange: (value) => set("referenceNo", String(value ?? "")) },
    ] },
    { key: "line", title: "单据行", layout: { columns: 3, density: "compact" }, items: [
      { key: "itemId", label: "物料", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: (workspace?.items ?? []).map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}` })) } }, value: line?.itemId ? String(line.itemId) : "", onChange: (value) => { const item = workspace?.items.find((candidate) => candidate.id === Number(value)); onChange({ ...draft, lines: [{ ...line, itemId: Number(value), unit: item?.baseUnit ?? line?.unit ?? "" }] }); } },
      { key: "warehouseId", label: "仓库", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: (workspace?.warehouses ?? []).map((warehouse) => ({ value: String(warehouse.id), label: `${warehouse.code} · ${warehouse.name}` })) } }, value: line?.warehouseId ? String(line.warehouseId) : "", onChange: (value) => setLine("warehouseId", Number(value)) },
      { key: "quantity", label: "数量", required: true, spec: { valueType: "number", control: "number", validation: { min: 0.000001 } }, value: line?.quantity ?? 1, step: 1, onChange: (value) => setLine("quantity", Number(value)) },
      { key: "unit", label: "单位", required: true, spec: { valueType: "string", control: "text" }, value: line?.unit ?? "", onChange: (value) => setLine("unit", String(value ?? "")) },
      { key: "unitPrice", label: draft.documentType === "issue" ? "单位成本（空白则按加权平均）" : "单位成本", spec: { valueType: "number", control: "number", validation: { min: 0 } }, value: line?.unitPrice ?? "", step: 0.01, onChange: (value) => setLine("unitPrice", String(value ?? "").trim() ? Number(value) : null) },
    ] },
  ];
}
