import type { CreateSurfaceSectionSpec, FormSurfaceFieldSpec } from "@workspace/core/ui";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";
import type { InventoryReceiptProductCatalogItem, InventoryReceiptRow } from "@workspace/inventory/types";

export type InventoryReceiptDraft = {
  year: number;
  month: number;
  productId: number;
  productName: string;
  specification: string;
  batchNumber: string;
  inputQuantityTenThousands: string;
  caseQuantity: string;
  extraPackageQuantity: string;
  packagingNote: string;
  batchId?: number;
  batchVersion?: number;
  productWorkPointId?: number;
  productWorkPointVersion?: number;
  workPoints: string;
  id?: number;
  version?: number;
};

function choiceItems(values: string[], current: string) {
  return [...new Set([...values, current].filter(Boolean))].map((value) => ({ value, label: value }));
}

function isNonNegativeIntegerInput(value: string, optional = false) {
  if (!value.trim()) return optional;
  return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function isNonNegativeNumberInput(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function catalogSelection(catalog: InventoryReceiptProductCatalogItem[], productId: number) {
  return catalog.find((item) => item.productId === productId);
}

function packageUnit(packagingNote: string) {
  return [...packagingNote.matchAll(/(盒|瓶)\s*\/\s*件/g)].at(-1)?.[1] ?? null;
}

export function validInventoryReceiptDraft(draft: InventoryReceiptDraft | null) {
  return Boolean(draft && Number.isInteger(draft.productId) && draft.productId > 0 && isProductionBatchNumber(draft.batchNumber)
    && draft.inputQuantityTenThousands && isNonNegativeIntegerInput(draft.caseQuantity)
    && isNonNegativeIntegerInput(draft.extraPackageQuantity, true) && draft.packagingNote
    && isNonNegativeNumberInput(draft.workPoints));
}

export function applyInventoryReceiptCatalogChange(
  current: InventoryReceiptDraft,
  productId: number,
  catalog: InventoryReceiptProductCatalogItem[],
): InventoryReceiptDraft {
  const product = catalogSelection(catalog, productId);
  return {
    ...current,
    productId,
    productName: product?.productName ?? "",
    specification: product?.specification ?? "",
    packagingNote: product?.defaultPackagingNote ?? "",
    extraPackageQuantity: "",
  };
}

export function inventoryReceiptNumberText(value: number | null, digits = 4) {
  if (value === null) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

export function inventoryReceiptEditDraft(row: InventoryReceiptRow): InventoryReceiptDraft {
  return {
    year: row.year,
    month: row.month,
    productId: row.productId ?? 0,
    productName: row.productName,
    specification: row.specification ?? "",
    batchNumber: row.batchNumber,
    inputQuantityTenThousands: row.inputQuantityTenThousands === null ? "" : String(row.inputQuantityTenThousands),
    caseQuantity: row.caseQuantity === null ? "" : String(row.caseQuantity),
    extraPackageQuantity: row.extraPackageQuantity === null || row.extraPackageQuantity === 0 ? "" : String(row.extraPackageQuantity),
    packagingNote: row.packagingNote,
    id: row.id,
    version: row.version,
    batchVersion: row.batchVersion,
    productWorkPointId: row.productWorkPointId ?? undefined,
    productWorkPointVersion: row.productWorkPointVersion ?? undefined,
    workPoints: row.workPoints === null ? "" : String(row.workPoints),
  };
}

export function inventoryReceiptFormFields(
  draft: InventoryReceiptDraft,
  change: (key: keyof InventoryReceiptDraft, value: unknown) => void,
  reuseBatch: boolean,
  rows: InventoryReceiptRow[] = [],
  catalog: InventoryReceiptProductCatalogItem[] = [],
  readOnly = false,
  lockPeriod = false,
): FormSurfaceFieldSpec[] {
  const batches = [...new Map(rows.filter((row) => row.year === draft.year && row.month === draft.month).map((row) => [row.batchId, row])).values()];
  const existingProductWorkPoint = rows.find((row) => row.year === draft.year && row.month === draft.month && row.productId === draft.productId);
  const product = catalogSelection(catalog, draft.productId);
  const containerUnit = packageUnit(draft.packagingNote);
  const fieldState = (shared = false) => readOnly || shared ? "disabled" as const : "normal" as const;
  return [
    ...(rows.length ? [{ key: "batchId", label: "批号归属", span: 2, spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, items: [
      { value: "", label: "新建批号" },
      ...batches.map((row) => ({ value: String(row.batchId), label: `${row.productName} · ${row.batchNumber} · 投料 ${inventoryReceiptNumberText(row.inputQuantityTenThousands)}` })),
    ] } }, value: draft.batchId ? String(draft.batchId) : "", onChange: (value: unknown) => change("batchId", value) } satisfies FormSurfaceFieldSpec] : []),
    { key: "year", label: "年度", required: true, spec: { valueType: "number", control: "number", state: fieldState(reuseBatch || lockPeriod) }, value: draft.year, onChange: (value) => change("year", value) },
    { key: "month", label: "月份", required: true, spec: { valueType: "number", control: "number", validation: { min: 1, max: 12 }, state: fieldState(reuseBatch || lockPeriod) }, value: draft.month, onChange: (value) => change("month", value) },
    { key: "productId", label: "产品", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: catalog.map((item) => ({ value: String(item.productId), label: `${item.productName}${item.specification ? ` · ${item.specification}` : ""}` })) }, state: fieldState(reuseBatch) }, value: draft.productId > 0 ? String(draft.productId) : "", onChange: (value) => change("productId", value), placeholder: "选择产品主数据" },
    { key: "specification", label: "规格", required: true, spec: { valueType: "string", control: "text", state: "disabled" }, value: draft.specification, onChange: () => undefined },
    { key: "workPoints", label: "本月产品工分", required: true, spec: { valueType: "number", control: "number", validation: { min: 0 }, state: fieldState(Boolean(existingProductWorkPoint && !draft.id)) }, value: draft.workPoints, onChange: (value) => change("workPoints", value), inputMode: "decimal", error: draft.workPoints && !isNonNegativeNumberInput(draft.workPoints) ? "工分必须是非负数" : undefined },
    { key: "batchNumber", label: "批号", required: true, spec: { valueType: "string", control: "text", state: fieldState(reuseBatch) }, value: draft.batchNumber, onChange: (value) => change("batchNumber", value), inputMode: "numeric", maxLength: 8, placeholder: "例如 20260508", error: draft.batchNumber && !isProductionBatchNumber(draft.batchNumber) ? PRODUCTION_BATCH_NUMBER_MESSAGE : undefined },
    { key: "inputQuantityTenThousands", label: "投料量（万粒/片）", required: true, spec: { valueType: "number", control: "number", state: fieldState(reuseBatch) }, value: draft.inputQuantityTenThousands, onChange: (value) => change("inputQuantityTenThousands", value), inputMode: "decimal" },
    { key: "packagingNote", label: "包装备注", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: choiceItems(product?.packagingNotes ?? [], draft.packagingNote) }, state: fieldState(!product) }, value: draft.packagingNote, onChange: (value) => change("packagingNote", value) },
    { key: "caseQuantity", label: "整件数", required: true, spec: { valueType: "number", control: "number", validation: { min: 0 }, state: fieldState() }, value: draft.caseQuantity, onChange: (value) => change("caseQuantity", value), inputMode: "numeric", step: 1, error: draft.caseQuantity && !isNonNegativeIntegerInput(draft.caseQuantity) ? "整件数必须是非负整数" : undefined },
    { key: "extraPackageQuantity", label: `尾数（${containerUnit ?? "盒/瓶"}）`, spec: { valueType: "number", control: "number", validation: { min: 0 }, state: fieldState(!containerUnit) }, value: draft.extraPackageQuantity, onChange: (value) => change("extraPackageQuantity", value), inputMode: "numeric", step: 1, error: draft.extraPackageQuantity && !isNonNegativeIntegerInput(draft.extraPackageQuantity, true) ? "尾数必须是非负整数" : undefined },
  ];
}

export function inventoryReceiptFormSections(
  draft: InventoryReceiptDraft,
  change: (key: keyof InventoryReceiptDraft, value: unknown) => void,
  rows: InventoryReceiptRow[],
  catalog: InventoryReceiptProductCatalogItem[],
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{ key: "source-fields", title: "生产信息", layout: { columns: 2, density: "compact" }, items: inventoryReceiptFormFields(draft, change, Boolean(draft.batchId), rows, catalog) }];
}
