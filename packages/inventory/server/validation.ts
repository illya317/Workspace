import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { CreateInventoryDocumentInput, LinkInventoryVoucherInput } from "../types";

export function buildCreateInventoryDocumentCommand(input: CreateInventoryDocumentInput, userId: number): DomainValidationResult<{ input: CreateInventoryDocumentInput; userId: number }> {
  const normalized = { ...input, companyCode: text(input.companyCode), documentNo: text(input.documentNo), documentDate: text(input.documentDate) };
  if (!normalized.companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!normalized.documentNo) return failCommand("单据编号为必填", 400, "documentNo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.documentDate)) return failCommand("单据日期必须为 YYYY-MM-DD", 400, "documentDate");
  if (!Array.isArray(input.lines) || input.lines.length === 0) return failCommand("单据至少包含一行", 400, "lines");
  if (input.lines.some((line) => !Number.isInteger(line.itemId) || !Number.isInteger(line.warehouseId) || !Number.isFinite(line.quantity) || line.quantity <= 0)) return failCommand("单据行物料、仓库或数量无效", 400, "lines");
  return okCommand({ input: normalized, userId });
}

export function buildInventoryDocumentLifecycleCommand(input: { id: number; action: "post" | "reverse" }, userId: number) {
  if (!Number.isInteger(input.id) || input.id <= 0) return failCommand("单据ID无效", 400, "id");
  if (input.action !== "post" && input.action !== "reverse") return failCommand("单据动作无效", 400, "action");
  return okCommand({ ...input, userId });
}

export function buildLinkInventoryVoucherCommand(input: LinkInventoryVoucherInput, userId: number) {
  if (!text(input.companyCode)) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) return failCommand("月份无效", 400, "month");
  if (!Number.isInteger(input.voucherId) || input.voucherId <= 0) return failCommand("凭证ID无效", 400, "voucherId");
  return okCommand({ ...input, companyCode: text(input.companyCode), userId });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
