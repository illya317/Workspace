import type {
  InventoryReceiptCreateInput,
  InventoryReceiptReportActionInput,
  InventoryReceiptUpdateInput,
} from "../receipts/schemas";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";

type ValidationResult<T> = { ok: true; data: T } | { ok: false; issue: { message: string; status?: number } };

export type ReceiptWriteData = {
  year: number;
  month: number;
  productId: number;
  batchNumber: string;
  inputQuantityTenThousands: number;
  productionQuantityText: string;
  packagingNote: string;
  caseQuantity: number;
  extraPackageQuantity: number;
  packagesPerCase: number;
  unitsPerPackage: number;
  packageUnit: "盒" | "瓶";
  workPoints: number;
};

export type ReceiptCreateCommand = ReceiptWriteData & {
  userId: number;
  batchId?: number;
  productWorkPointVersion?: number;
};
export type ReceiptUpdateCommand = ReceiptWriteData & {
  id: number;
  userId: number;
  version: number;
  batchVersion: number;
  productWorkPointVersion?: number;
};
export type ReceiptDeleteCommand = { id: number; userId: number; expectedVersion?: number };
export type ReceiptReportActionCommand = { reportId: number; userId: number; expectedVersion: number };

function optionalNonNegativeInteger(value: string | number | null | undefined, label: string): ValidationResult<number | null> {
  if (value === null || value === undefined || String(value).trim() === "") return { ok: true, data: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return { ok: false, issue: { message: `${label}必须是非负整数` } };
  return { ok: true, data: parsed };
}

function nonNegativeInteger(value: string | number, label: string): ValidationResult<number> {
  if (String(value).trim() === "") return { ok: false, issue: { message: `${label}必须是非负整数` } };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return { ok: false, issue: { message: `${label}必须是非负整数` } };
  return { ok: true, data: parsed };
}

function positiveNumber(value: string | number, label: string): ValidationResult<number> {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return { ok: false, issue: { message: `${label}必须是大于0的数字` } };
  return { ok: true, data: parsed };
}

function nonNegativeNumber(value: string | number, label: string): ValidationResult<number> {
  const parsed = Number(value);
  if (String(value).trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, issue: { message: `${label}必须是非负数` } };
  }
  return { ok: true, data: parsed };
}

export function parseProductionQuantity(text: string): ValidationResult<{ caseQuantity: number; extraPackageQuantity: number; extraUnit: "盒" | "瓶" | null }> {
  const normalized = text.replace(/[，,\s]/g, "");
  const match = normalized.match(/^(\d+)件(?:(\d+)(盒|瓶))?$/);
  if (!match) return { ok: false, issue: { message: "生产数量请填写为“120件”或“50件250盒/瓶”" } };
  return { ok: true, data: { caseQuantity: Number(match[1]), extraPackageQuantity: match[2] ? Number(match[2]) : 0, extraUnit: (match[3] as "盒" | "瓶" | undefined) ?? null } };
}

export function parsePackagingNote(note: string): ValidationResult<{ packagesPerCase: number; unitsPerPackage: number; packageUnit: "盒" | "瓶" }> {
  const normalized = note.replace(/[，,\s]/g, "").replace(/[×xX]/g, "*");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(盒|瓶)\s*\/\s*件/g)];
  const packageMatch = matches.at(-1);
  if (!packageMatch || packageMatch.index === undefined) return { ok: false, issue: { message: "包装备注末尾需包含“400盒/件”或“480瓶/件”" } };
  const prefix = normalized.slice(0, packageMatch.index);
  const factors = [...prefix.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (factors.length === 0 || factors.some((value) => !Number.isFinite(value) || value <= 0)) return { ok: false, issue: { message: "包装备注前段未解析到每盒/瓶粒片数" } };
  return { ok: true, data: { packagesPerCase: Number(packageMatch[1]), packageUnit: packageMatch[2] as "盒" | "瓶", unitsPerPackage: factors.reduce((product, value) => product * value, 1) } };
}

function buildWriteData(input: InventoryReceiptCreateInput | InventoryReceiptUpdateInput): ValidationResult<ReceiptWriteData> {
  if (!isProductionBatchNumber(input.batchNumber)) return { ok: false, issue: { message: PRODUCTION_BATCH_NUMBER_MESSAGE } };
  const inputQuantity = positiveNumber(input.inputQuantityTenThousands, "投料量");
  if (!inputQuantity.ok) return inputQuantity;
  const caseQuantity = nonNegativeInteger(input.caseQuantity, "整件数");
  if (!caseQuantity.ok) return caseQuantity;
  const extraPackageQuantity = optionalNonNegativeInteger(input.extraPackageQuantity, "尾数");
  if (!extraPackageQuantity.ok) return extraPackageQuantity;
  const packaging = parsePackagingNote(input.packagingNote);
  if (!packaging.ok) return packaging;
  const workPoints = nonNegativeNumber(input.workPoints, "工分");
  if (!workPoints.ok) return workPoints;
  if ((extraPackageQuantity.data ?? 0) >= packaging.data.packagesPerCase) return { ok: false, issue: { message: `尾数必须小于每件${packaging.data.packagesPerCase}${packaging.data.packageUnit}` } };
  const productionQuantityText = `${caseQuantity.data}件${extraPackageQuantity.data ? `${extraPackageQuantity.data}${packaging.data.packageUnit}` : ""}`;
  return { ok: true, data: {
    year: input.year, month: input.month, productId: input.productId,
    batchNumber: input.batchNumber.trim(), inputQuantityTenThousands: inputQuantity.data,
    productionQuantityText, packagingNote: input.packagingNote.trim(),
    caseQuantity: caseQuantity.data, extraPackageQuantity: extraPackageQuantity.data ?? 0,
    packagesPerCase: packaging.data.packagesPerCase, unitsPerPackage: packaging.data.unitsPerPackage, packageUnit: packaging.data.packageUnit,
    workPoints: workPoints.data,
  } };
}

export function buildReceiptCreateCommand(input: InventoryReceiptCreateInput, userId: number): ValidationResult<ReceiptCreateCommand> {
  const data = buildWriteData(input);
  if (!data.ok) return data;
  return { ok: true, data: {
    ...data.data,
    userId,
    batchId: input.batchId,
    productWorkPointVersion: input.productWorkPointVersion,
  } };
}

export function buildReceiptUpdateCommand(id: number, input: InventoryReceiptUpdateInput, userId: number): ValidationResult<ReceiptUpdateCommand> {
  const data = buildWriteData(input);
  if (!data.ok) return data;
  return { ok: true, data: {
    ...data.data,
    id,
    userId,
    version: input.version,
    batchVersion: input.batchVersion,
    productWorkPointVersion: input.productWorkPointVersion,
  } };
}

export function buildReceiptDeleteCommand(id: number, userId: number, expectedVersion?: number): ValidationResult<ReceiptDeleteCommand> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, issue: { message: "无效记录ID" } };
  return { ok: true, data: { id, userId, expectedVersion } };
}

function buildReceiptReportActionCommand(reportId: number, input: InventoryReceiptReportActionInput, userId: number): ValidationResult<ReceiptReportActionCommand> {
  if (!Number.isInteger(reportId) || reportId <= 0) return { ok: false, issue: { message: "无效月报ID" } };
  return { ok: true, data: { reportId, userId, expectedVersion: input.expectedVersion } };
}

export const buildReceiptReportConfirmCommand = buildReceiptReportActionCommand;
export const buildReceiptReportReviewCommand = buildReceiptReportActionCommand;
