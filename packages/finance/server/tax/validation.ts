import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { createHash } from "node:crypto";

import type { TaxCreateInput, TaxUpdateInput } from "../../types/tax";
import { TAX_CALCULATION_VERSION, calculateTaxPaymentAllocation, calculateTaxWorkpaper } from "./calculations";
import { taxRegistrationPeriodScope } from "./registration-period-scope";

type TaxRegistrationFact = {
  id: number;
  companyCode: string;
  version: number;
  status: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
};
type TaxOwnedFact = { id: number; companyCode: string; version: number; status: string; currencyCode?: string };
export type TaxPaymentFact = {
  id: number;
  companyCode: string;
  paymentKind: string;
  paidOn: string;
  amount: number;
  currencyCode: string;
  paymentReference: string | null;
  note: string | null;
  reversesPaymentId: number | null;
  sourceKind: string | null;
  sourceReleaseId: string | null;
  sourceSha256: string | null;
  sourceFile: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  sourceRange: string | null;
  sourceKey: string | null;
  allocations: Array<{ filingId: number; voucherItemId: number | null; allocatedAmount: number }>;
};

export interface TaxValidationDependencies {
  findCompanyByCode(code: string): Promise<{ id: number; code: string; isActive: boolean } | null>;
  findPeriod(id: number): Promise<{ id: number; companyCode: string; year: number; month: number; isClosed: boolean } | null>;
  findTaxType(id: number): Promise<{ id: number; isActive: boolean } | null>;
  partyExists(id: number): Promise<boolean>;
  findRegistration(id: number): Promise<TaxRegistrationFact | null>;
  findWorkpaper(id: number): Promise<TaxOwnedFact | null>;
  findFiling(id: number): Promise<TaxOwnedFact | null>;
  findFilings(ids: number[]): Promise<Array<TaxOwnedFact & { currencyCode: string }>>;
  findAccrualLines(ids: number[]): Promise<Array<{ id: number; workpaperId: number }>>;
  findVoucherItems(ids: number[]): Promise<Array<{ id: number; companyCode: string; periodId: number; year: number; month: number }>>;
  findPaymentByIdempotencyKey(key: string): Promise<TaxPaymentFact | null>;
  findPayment(id: number): Promise<TaxPaymentFact | null>;
  paymentWasReversed(id: number): Promise<boolean>;
  filingHasAllocations(id: number): Promise<boolean>;
}

type TaxDerivedCalculation = { calculationVersion: string; inputFingerprint: string };
export type TaxCreateCommand = { input: TaxCreateInput; userId: number; companyId?: number; idempotentRecordId?: number; calculation?: TaxDerivedCalculation };
export type TaxUpdateCommand = { input: TaxUpdateInput; userId: number; companyId?: number; calculation?: TaxDerivedCalculation };

function workpaperCalculation(input: Extract<TaxCreateInput | TaxUpdateInput, { kind: "workpaper_create" | "workpaper_update" }>): TaxDerivedCalculation {
  const canonical = {
    registrationId: input.registrationId,
    periodId: input.periodId,
    lines: [...input.accrualLines].sort((left, right) => left.lineNo - right.lineNo).map((line) => ({
      lineNo: line.lineNo,
      voucherItemId: line.voucherItemId ?? null,
      recognitionOn: line.recognitionOn ?? null,
      description: line.description,
      taxBaseAmount: line.taxBaseAmount ?? null,
      taxRate: line.taxRate ?? null,
      quantity: line.quantity ?? null,
      unitRate: line.unitRate ?? null,
      divisor: line.divisor ?? null,
      sourceReportedTaxAmount: line.sourceReportedTaxAmount ?? null,
    })),
  };
  return {
    calculationVersion: TAX_CALCULATION_VERSION,
    inputFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
  };
}

function periodBounds(year: number, month: number) {
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isCurrencyCode(value: string) {
  return /^[A-Z]{3}$/.test(value);
}

async function validatePeriod(
  input: { periodId: number; companyCode: string; year: number; month: number },
  dependencies: TaxValidationDependencies,
) {
  const period = await dependencies.findPeriod(input.periodId);
  if (!period || period.companyCode !== input.companyCode || period.year !== input.year || period.month !== input.month) {
    return failCommand("会计期间不存在或不属于当前公司/年月", 400, "periodId");
  }
  if (period.isClosed) return failCommand("会计期间已关闭，不能修改税务记录", 409, "periodId");
  return okCommand(period);
}

async function validateEffectiveRegistration(
  registrationId: number,
  input: { companyCode: string; year: number; month: number },
  dependencies: TaxValidationDependencies,
) {
  const registration = await dependencies.findRegistration(registrationId);
  if (!registration || registration.companyCode !== input.companyCode) {
    return failCommand("纳税登记不存在或不属于当前公司", 400, "registrationId");
  }
  const scope = taxRegistrationPeriodScope(registration, input);
  if (!scope.inScope) {
    return failCommand("纳税登记在当前期间内未生效", 409, "registrationId");
  }
  if (scope.blockerCode === "registration_suspended_scope_unproven") {
    return failCommand("纳税登记处于暂停状态且缺少暂停生效日，不能证明目标期间可用", 409, "registrationId");
  }
  if (scope.blockerCode === "registration_end_date_missing") {
    return failCommand("已终止的纳税登记缺少失效日，不能证明目标期间可用", 409, "registrationId");
  }
  return okCommand(registration);
}

async function validateVoucherOwnership(
  values: Array<number | null | undefined>,
  companyCode: string,
  expectedScope: { periodId: number } | { year: number; month: number },
  dependencies: TaxValidationDependencies,
) {
  const ids = [...new Set(values.filter((value): value is number => value != null))];
  const items = await dependencies.findVoucherItems(ids);
  const outsideScope = items.some((item) => (
    item.companyCode !== companyCode
    || ("periodId" in expectedScope
      ? item.periodId !== expectedScope.periodId
      : item.year !== expectedScope.year || item.month !== expectedScope.month)
  ));
  if (items.length !== ids.length || outsideScope) {
    return failCommand("凭证明细不存在或不属于当前公司及业务期间", 400, "voucherItemId");
  }
  return okCommand(items);
}

export async function validateTaxRegistration(
  input: Extract<TaxCreateInput, { kind: "registration_create" }> | Extract<TaxUpdateInput, { kind: "registration_update" }>,
  dependencies: TaxValidationDependencies,
) {
  const company = await dependencies.findCompanyByCode(input.companyCode);
  if (!company || !company.isActive || company.code !== input.companyCode) {
    return failCommand("公司不存在或未启用", 400, "companyCode");
  }
  const taxType = await dependencies.findTaxType(input.taxTypeId);
  if (!taxType?.isActive) return failCommand("税种不存在或未启用", 400, "taxTypeId");
  if (input.authorityPartyId && !(await dependencies.partyExists(input.authorityPartyId))) {
    return failCommand("税务机关主体不存在", 400, "authorityPartyId");
  }
  if (!isIsoDate(input.effectiveFrom)) return failCommand("生效日期必须为有效的 YYYY-MM-DD 日期", 400, "effectiveFrom");
  if (input.effectiveThrough && !isIsoDate(input.effectiveThrough)) {
    return failCommand("失效日期必须为有效的 YYYY-MM-DD 日期", 400, "effectiveThrough");
  }
  if (input.effectiveThrough && input.effectiveThrough < input.effectiveFrom) {
    return failCommand("纳税登记有效期无效", 400, "effectiveThrough");
  }
  return okCommand(input);
}

export async function validateTaxWorkpaper(
  input: Extract<TaxCreateInput, { kind: "workpaper_create" }> | Extract<TaxUpdateInput, { kind: "workpaper_update" }>,
  dependencies: TaxValidationDependencies,
) {
  const period = await validatePeriod(input, dependencies);
  if (!period.ok) return period;
  const registration = await validateEffectiveRegistration(input.registrationId, input, dependencies);
  if (!registration.ok) return registration;
  if (new Set(input.accrualLines.map((line) => line.lineNo)).size !== input.accrualLines.length) {
    return failCommand("计税明细 lineNo 必须唯一", 400, "accrualLines");
  }
  const bounds = periodBounds(input.year, input.month);
  for (const line of input.accrualLines) {
    if (line.recognitionOn && !isIsoDate(line.recognitionOn)) {
      return failCommand("确认日期必须为有效的 YYYY-MM-DD 日期", 400, "recognitionOn");
    }
    if (line.recognitionOn && (line.recognitionOn < bounds.start || line.recognitionOn > bounds.end)) {
      return failCommand("确认日期必须位于目标会计期间内", 400, "recognitionOn");
    }
  }
  if (input.kind === "workpaper_create" && input.accrualLines.some((line) => line.id != null)) {
    return failCommand("新增工作底稿不能引用既有计税明细", 400, "accrualLines");
  }
  if (input.kind === "workpaper_update") {
    const ids = input.accrualLines.flatMap((line) => line.id == null ? [] : [line.id]);
    if (new Set(ids).size !== ids.length) return failCommand("计税明细 id 不能重复", 400, "accrualLines");
    const lines = await dependencies.findAccrualLines(ids);
    if (lines.length !== ids.length || lines.some((line) => line.workpaperId !== input.id)) {
      return failCommand("计税明细不存在或不属于当前工作底稿", 400, "accrualLines");
    }
  }
  try {
    const calculated = calculateTaxWorkpaper(input.accrualLines);
    if (input.status === "reconciled" && calculated.sourceDifference !== null && Math.abs(calculated.sourceDifference) > 0.01) {
      return failCommand("计税底稿仍有来源差异，不能标记 reconciled", 409, "status");
    }
  } catch (error) {
    return failCommand(error instanceof Error ? error.message : "计税方法无效", 400, "accrualLines");
  }
  const vouchers = await validateVoucherOwnership(
    input.accrualLines.map((line) => line.voucherItemId),
    input.companyCode,
    { periodId: input.periodId },
    dependencies,
  );
  return vouchers.ok ? okCommand(input) : vouchers;
}

export async function validateTaxFiling(
  input: Extract<TaxCreateInput, { kind: "filing_create" }> | Extract<TaxUpdateInput, { kind: "filing_update" }>,
  dependencies: TaxValidationDependencies,
) {
  const period = await validatePeriod(input, dependencies);
  if (!period.ok) return period;
  const registration = await validateEffectiveRegistration(input.registrationId, input, dependencies);
  if (!registration.ok) return registration;
  if (!isCurrencyCode(input.currencyCode)) return failCommand("币种必须为三位大写字母代码", 400, "currencyCode");
  if (input.filedOn && !isIsoDate(input.filedOn)) return failCommand("申报日期必须为有效的 YYYY-MM-DD 日期", 400, "filedOn");
  if (input.status !== "draft" && !input.filedOn) return failCommand("非草稿申报必须提供 filedOn", 400, "filedOn");
  if (input.kind === "filing_update") {
    const target = await dependencies.findFiling(input.id);
    if (target?.currencyCode !== input.currencyCode && await dependencies.filingHasAllocations(input.id)) {
      return failCommand("已有支付分配的申报不能变更币种", 409, "currencyCode");
    }
  }
  return okCommand(input);
}

function sameAllocations(left: TaxPaymentFact["allocations"], right: TaxPaymentFact["allocations"]) {
  const normalize = (items: TaxPaymentFact["allocations"]) => items
    .map((item) => `${item.filingId}:${item.voucherItemId ?? ""}:${item.allocatedAmount}`)
    .sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export async function validateTaxPayment(
  input: Extract<TaxCreateInput, { kind: "payment_append" }>,
  dependencies: TaxValidationDependencies,
) {
  const company = await dependencies.findCompanyByCode(input.companyCode);
  if (!company || !company.isActive || company.code !== input.companyCode) {
    return failCommand("公司不存在或未启用", 400, "companyCode");
  }
  if (!isIsoDate(input.paidOn)) return failCommand("支付日期必须为有效的 YYYY-MM-DD 日期", 400, "paidOn");
  if (!Number.isFinite(input.amount) || input.amount <= 0) return failCommand("支付金额必须大于 0", 400, "amount");
  if (!isCurrencyCode(input.currencyCode)) return failCommand("币种必须为三位大写字母代码", 400, "currencyCode");
  if (input.allocations.some((allocation) => !Number.isFinite(allocation.allocatedAmount) || allocation.allocatedAmount <= 0)) {
    return failCommand("分配金额必须大于 0", 400, "allocations");
  }
  const existing = await dependencies.findPaymentByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    const requestedAllocations = input.allocations.map((allocation) => ({
      filingId: allocation.filingId,
      voucherItemId: allocation.voucherItemId ?? null,
      allocatedAmount: allocation.allocatedAmount,
    }));
    const same = existing.companyCode === input.companyCode
      && existing.paymentKind === input.paymentKind
      && existing.paidOn === input.paidOn
      && existing.amount === input.amount
      && existing.currencyCode === input.currencyCode
      && existing.paymentReference === (input.paymentReference ?? null)
      && existing.note === (input.note ?? null)
      && existing.reversesPaymentId === (input.reversesPaymentId ?? null)
      && existing.sourceKind === (input.sourceKind ?? null)
      && existing.sourceReleaseId === (input.sourceReleaseId ?? null)
      && existing.sourceSha256 === (input.sourceSha256 ?? null)
      && existing.sourceFile === (input.sourceFile ?? null)
      && existing.sourceSheet === (input.sourceSheet ?? null)
      && existing.sourceRow === (input.sourceRow ?? null)
      && existing.sourceRange === (input.sourceRange ?? null)
      && existing.sourceKey === (input.sourceKey ?? null)
      && sameAllocations(existing.allocations, requestedAllocations);
    if (!same) return failCommand("幂等键已被不同税款支付占用", 409, "idempotencyKey");
    return okCommand({ input, idempotentRecordId: existing.id });
  }

  const filingIds = input.allocations.map((allocation) => allocation.filingId);
  if (new Set(filingIds).size !== filingIds.length) return failCommand("同一支付不能重复分配到同一申报", 400, "allocations");
  const filings = await dependencies.findFilings(filingIds);
  if (filings.length !== filingIds.length || filings.some((filing) => filing.companyCode !== input.companyCode)) {
    return failCommand("申报不存在或不属于支付公司", 400, "allocations");
  }
  if (filings.some((filing) => !["filed", "accepted", "amended"].includes(filing.status))) {
    return failCommand("支付只能分配到 filed、accepted 或 amended 状态的申报", 409, "allocations");
  }
  if (filings.some((filing) => filing.currencyCode !== input.currencyCode)) {
    return failCommand("申报币种与支付币种不一致", 400, "currencyCode");
  }
  const allocation = calculateTaxPaymentAllocation(input.amount, input.allocations);
  if (allocation.unallocatedAmount < 0) return failCommand("分配金额合计不能超过支付金额", 400, "allocations");
  const paidOn = new Date(`${input.paidOn}T00:00:00.000Z`);
  const vouchers = await validateVoucherOwnership(
    input.allocations.map((item) => item.voucherItemId),
    input.companyCode,
    { year: paidOn.getUTCFullYear(), month: paidOn.getUTCMonth() + 1 },
    dependencies,
  );
  if (!vouchers.ok) return vouchers;

  if (input.paymentKind === "reversal") {
    const reversed = input.reversesPaymentId ? await dependencies.findPayment(input.reversesPaymentId) : null;
    if (!reversed
      || reversed.companyCode !== input.companyCode
      || reversed.paymentKind === "reversal"
      || input.paidOn < reversed.paidOn
      || reversed.amount !== input.amount
      || reversed.currencyCode !== input.currencyCode
      || await dependencies.paymentWasReversed(reversed.id)) {
      return failCommand("被冲销支付不存在、已冲销或公司/币种/金额不一致", 409, "reversesPaymentId");
    }
    if (input.allocations.length > 0) return failCommand("冲销支付不得重新分配申报", 400, "allocations");
  } else if (input.reversesPaymentId) {
    return failCommand("非冲销支付不能指定 reversesPaymentId", 400, "reversesPaymentId");
  }
  return okCommand({ input });
}

async function validateUpdateTarget(input: TaxUpdateInput, dependencies: TaxValidationDependencies) {
  const target = input.kind === "registration_update"
    ? await dependencies.findRegistration(input.id)
    : input.kind === "workpaper_update"
      ? await dependencies.findWorkpaper(input.id)
      : await dependencies.findFiling(input.id);
  if (!target || target.companyCode !== input.companyCode) return failCommand("目标记录不存在或不属于当前公司", 404, "id");
  if (target.version !== input.version) return failCommand("记录已被其他人修改，请刷新后重试", 409, "version");
  return okCommand(target);
}

export async function buildTaxCreateCommand(
  input: TaxCreateInput,
  userId: number,
  dependencies?: TaxValidationDependencies,
): Promise<DomainValidationResult<TaxCreateCommand>> {
  dependencies ??= (await import("./reference-adapter")).taxValidationDependencies;
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId");
  if (input.kind === "registration_create") {
    const result = await validateTaxRegistration(input, dependencies);
    if (!result.ok) return result;
    const company = await dependencies.findCompanyByCode(input.companyCode);
    return company ? okCommand({ input: result.data, userId, companyId: company.id }) : failCommand("公司不存在或未启用", 400, "companyCode");
  }
  if (input.kind === "workpaper_create") {
    const result = await validateTaxWorkpaper(input, dependencies);
    return result.ok ? okCommand({ input: result.data, userId, calculation: workpaperCalculation(input) }) : result;
  }
  if (input.kind === "filing_create") {
    const result = await validateTaxFiling(input, dependencies);
    return result.ok ? okCommand({ input: result.data, userId }) : result;
  }
  const result = await validateTaxPayment(input, dependencies);
  if (!result.ok) return result;
  const company = await dependencies.findCompanyByCode(input.companyCode);
  return company ? okCommand({ input, userId, companyId: company.id, idempotentRecordId: result.data.idempotentRecordId }) : failCommand("公司不存在或未启用", 400, "companyCode");
}

export async function buildTaxUpdateCommand(
  input: TaxUpdateInput,
  userId: number,
  dependencies?: TaxValidationDependencies,
): Promise<DomainValidationResult<TaxUpdateCommand>> {
  dependencies ??= (await import("./reference-adapter")).taxValidationDependencies;
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId");
  const target = await validateUpdateTarget(input, dependencies);
  if (!target.ok) return target;
  const result = input.kind === "registration_update"
    ? await validateTaxRegistration(input, dependencies)
    : input.kind === "workpaper_update"
      ? await validateTaxWorkpaper(input, dependencies)
      : await validateTaxFiling(input, dependencies);
  if (!result.ok) return result;
  if (input.kind === "workpaper_update") return okCommand({ input, userId, calculation: workpaperCalculation(input) });
  if (input.kind === "registration_update") {
    const company = await dependencies.findCompanyByCode(input.companyCode);
    return company ? okCommand({ input, userId, companyId: company.id }) : failCommand("公司不存在或未启用", 400, "companyCode");
  }
  return okCommand({ input, userId });
}
