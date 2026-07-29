import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { TaxCreateInput, TaxUpdateInput } from "../../types/tax";
import { calculateTaxPaymentAllocation, calculateTaxWorkpaper } from "../tax/calculations";
import { taxValidationDeps } from "./tax-reference-adapter";
import {
  buildTaxCreateCommand as buildCanonicalTaxCreateCommand,
  buildTaxUpdateCommand as buildCanonicalTaxUpdateCommand,
  type TaxCreateCommand as CanonicalTaxCreateCommand,
  type TaxUpdateCommand as CanonicalTaxUpdateCommand,
} from "../tax/validation";

export type OwnedFact = { id: number; companyCode: string; version?: number; status?: string; currencyCode?: string; amount?: unknown; paymentKind?: string; reversesPaymentId?: number | null };
export interface TaxValidationDeps {
  company(id: number): Promise<{ id: number; code: string; isActive: boolean } | null>;
  period(id: number): Promise<{ id: number; companyCode: string; year: number; month: number; isClosed: boolean } | null>;
  taxType(id: number): Promise<{ id: number; isActive: boolean; jurisdiction: string } | null>;
  partyExists(id: number): Promise<boolean>;
  registration(id: number): Promise<OwnedFact | null>;
  workpaper(id: number): Promise<OwnedFact | null>;
  filing(id: number): Promise<OwnedFact | null>;
  filings(ids: number[]): Promise<OwnedFact[]>;
  voucherItems(ids: number[]): Promise<Array<{ id: number; companyCode: string }>>;
  paymentByKey(key: string): Promise<OwnedFact | null>;
  payment(id: number): Promise<OwnedFact | null>;
  paymentWasReversed(id: number): Promise<boolean>;
}
type TaxCreateCommand = { input: TaxCreateInput; userId: number; idempotentRecordId?: number };
type TaxUpdateCommand = { input: TaxUpdateInput; userId: number };
function dateOrder(from: string, through?: string | null) { return !through || from <= through; }
async function periodCheck(input: { periodId: number; companyCode: string; year: number; month: number }, deps: TaxValidationDeps) {
  const period = await deps.period(input.periodId);
  if (!period || period.companyCode !== input.companyCode || period.year !== input.year || period.month !== input.month) return failCommand("会计期间不存在或不属于当前公司/年月", 400, "periodId");
  if (period.isClosed) return failCommand("会计期间已关闭，不能修改税务工作底稿", 409, "periodId");
  return okCommand(period);
}
async function registrationCheck(registrationId: number, companyCode: string, deps: TaxValidationDeps) {
  const registration = await deps.registration(registrationId);
  if (!registration || registration.companyCode !== companyCode || registration.status === "ended") return failCommand("纳税登记不存在、已终止或不属于当前公司", 400, "registrationId");
  return okCommand(registration);
}
async function vouchersCheck(ids: Array<number | null | undefined>, companyCode: string, deps: TaxValidationDeps) {
  const unique = [...new Set(ids.filter((id): id is number => Boolean(id)))]; const rows = await deps.voucherItems(unique);
  if (rows.length !== unique.length || rows.some((row) => row.companyCode !== companyCode)) return failCommand("凭证明细不存在或不属于当前公司", 400, "voucherItemId");
  return okCommand(rows);
}
export async function validateTaxRegistration(input: Extract<TaxCreateInput, { kind: "registration_create" }> | Extract<TaxUpdateInput, { kind: "registration_update" }>, deps: TaxValidationDeps) {
  const company = await deps.company(input.companyId); if (!company || company.code !== input.companyCode || !company.isActive) return failCommand("公司不存在、不启用或 code 不一致", 400, "companyId");
  const taxType = await deps.taxType(input.taxTypeId); if (!taxType || !taxType.isActive) return failCommand("税种不存在或未启用", 400, "taxTypeId");
  if (input.authorityPartyId && !(await deps.partyExists(input.authorityPartyId))) return failCommand("税务机关主体不存在", 400, "authorityPartyId");
  if (!dateOrder(input.effectiveFrom, input.effectiveThrough)) return failCommand("纳税登记有效期无效", 400, "effectiveThrough");
  return okCommand(input);
}
export async function validateTaxWorkpaper(input: Extract<TaxCreateInput, { kind: "workpaper_create" }> | Extract<TaxUpdateInput, { kind: "workpaper_update" }>, deps: TaxValidationDeps) {
  const period = await periodCheck(input, deps); if (!period.ok) return period; const registration = await registrationCheck(input.registrationId, input.companyCode, deps); if (!registration.ok) return registration;
  if (new Set(input.accrualLines.map((line) => line.lineNo)).size !== input.accrualLines.length) return failCommand("计税明细 lineNo 必须唯一", 400, "accrualLines");
  try { const control = calculateTaxWorkpaper(input.accrualLines); if (input.status === "reconciled" && control.sourceDifference && Math.abs(control.sourceDifference) > 0.01) return failCommand("计税底稿仍有来源差异，不能标记 reconciled", 409, "status"); } catch (error) { return failCommand(error instanceof Error ? error.message : "计税方法无效", 400, "accrualLines"); }
  const vouchers = await vouchersCheck(input.accrualLines.map((line) => line.voucherItemId), input.companyCode, deps); if (!vouchers.ok) return vouchers;
  return okCommand(input);
}
export async function validateTaxFiling(input: Extract<TaxCreateInput, { kind: "filing_create" }> | Extract<TaxUpdateInput, { kind: "filing_update" }>, deps: TaxValidationDeps) {
  const period = await periodCheck(input, deps); if (!period.ok) return period; const registration = await registrationCheck(input.registrationId, input.companyCode, deps); if (!registration.ok) return registration;
  if (input.status !== "draft" && !input.filedOn) return failCommand("非草稿申报必须提供 filedOn", 400, "filedOn");
  return okCommand(input);
}
export async function validateTaxPayment(input: Extract<TaxCreateInput, { kind: "payment_append" }>, deps: TaxValidationDeps) {
  const company = await deps.company(input.companyId); if (!company || company.code !== input.companyCode || !company.isActive) return failCommand("公司不存在、不启用或 code 不一致", 400, "companyId");
  const existing = await deps.paymentByKey(input.idempotencyKey);
  if (existing) { if (existing.companyCode !== input.companyCode || existing.paymentKind !== input.paymentKind || Number(existing.amount) !== input.amount || existing.currencyCode !== input.currencyCode || existing.reversesPaymentId !== (input.reversesPaymentId ?? null)) return failCommand("幂等键已被不同税款支付占用", 409, "idempotencyKey"); return okCommand({ input, idempotentRecordId: existing.id }); }
  const allocationIds = input.allocations.map((item) => item.filingId); if (new Set(allocationIds).size !== allocationIds.length) return failCommand("同一支付不能重复分配到同一申报", 400, "allocations");
  const filings = await deps.filings(allocationIds); if (filings.length !== allocationIds.length || filings.some((filing) => filing.companyCode !== input.companyCode || filing.currencyCode !== input.currencyCode)) return failCommand("申报不存在或公司/币种与支付不一致", 400, "allocations");
  const allocation = calculateTaxPaymentAllocation(input.amount, input.allocations); if (allocation.unallocatedAmount < 0) return failCommand("分配金额合计不能超过支付金额", 400, "allocations");
  const vouchers = await vouchersCheck(input.allocations.map((item) => item.voucherItemId), input.companyCode, deps); if (!vouchers.ok) return vouchers;
  if (input.paymentKind === "reversal") { const reversed = input.reversesPaymentId ? await deps.payment(input.reversesPaymentId) : null; if (!reversed || reversed.companyCode !== input.companyCode || reversed.paymentKind === "reversal" || Number(reversed.amount) !== input.amount || reversed.currencyCode !== input.currencyCode || await deps.paymentWasReversed(reversed.id)) return failCommand("被冲销支付不存在、已冲销或公司/币种/金额不一致", 409, "reversesPaymentId"); if (input.allocations.length) return failCommand("冲销支付不得重新分配申报", 400, "allocations"); }
  else if (input.reversesPaymentId) return failCommand("非冲销支付不能指定 reversesPaymentId", 400, "reversesPaymentId");
  return okCommand({ input });
}
async function updateTarget(input: TaxUpdateInput, deps: TaxValidationDeps) { const target = input.kind === "registration_update" ? await deps.registration(input.id) : input.kind === "workpaper_update" ? await deps.workpaper(input.id) : await deps.filing(input.id); if (!target || target.companyCode !== input.companyCode) return failCommand("目标记录不存在或不属于当前公司", 404, "id"); if (target.version !== input.version) return failCommand("记录已被其他人修改，请刷新后重试", 409, "version"); return okCommand(target); }
export async function buildTaxCreateCommand(input: TaxCreateInput, userId: number, deps: TaxValidationDeps = taxValidationDeps): Promise<DomainValidationResult<TaxCreateCommand>> { if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId"); if (input.kind === "registration_create") { const r = await validateTaxRegistration(input, deps); return r.ok ? okCommand({ input: r.data, userId }) : r; } if (input.kind === "workpaper_create") { const r = await validateTaxWorkpaper(input, deps); return r.ok ? okCommand({ input: r.data, userId }) : r; } if (input.kind === "filing_create") { const r = await validateTaxFiling(input, deps); return r.ok ? okCommand({ input: r.data, userId }) : r; } const r = await validateTaxPayment(input, deps); return r.ok ? okCommand({ ...r.data, userId }) : r; }
export async function buildTaxUpdateCommand(input: TaxUpdateInput, userId: number, deps: TaxValidationDeps = taxValidationDeps): Promise<DomainValidationResult<TaxUpdateCommand>> { if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId"); const target = await updateTarget(input, deps); if (!target.ok) return target; if (input.kind === "registration_update") { const r = await validateTaxRegistration(input, deps); return r.ok ? okCommand({ input, userId }) : r; } if (input.kind === "workpaper_update") { const r = await validateTaxWorkpaper(input, deps); return r.ok ? okCommand({ input, userId }) : r; } const r = await validateTaxFiling(input, deps); return r.ok ? okCommand({ input, userId }) : r; }

export function validateTaxCreatePersistenceCommand(command: CanonicalTaxCreateCommand) {
  return buildCanonicalTaxCreateCommand(command.input, command.userId);
}

export function validateTaxUpdatePersistenceCommand(command: CanonicalTaxUpdateCommand) {
  return buildCanonicalTaxUpdateCommand(command.input, command.userId);
}
