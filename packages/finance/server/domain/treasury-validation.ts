import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { TreasuryCreateInput, TreasuryUpdateInput } from "../../types/treasury";
import { calculateBankReconciliation, calculateInterestWorkpaper } from "../treasury/calculations";
import { treasuryValidationDeps } from "./treasury-reference-adapter";
import {
  buildTreasuryCreateCommand as buildCanonicalTreasuryCreateCommand,
  buildTreasuryUpdateCommand as buildCanonicalTreasuryUpdateCommand,
  type TreasuryCreateCommand as CanonicalTreasuryCreateCommand,
  type TreasuryUpdateCommand as CanonicalTreasuryUpdateCommand,
} from "../treasury/validation";

type CompanyFact = { id: number; code: string; isActive: boolean };
type PeriodFact = { id: number; companyCode: string; year: number; month: number; isClosed: boolean };
type OwnedFact = { id: number; companyCode: string; version?: number; status?: string; currencyCode?: string; startOn?: Date; endOn?: Date | null };
type VoucherFact = { id: number; companyCode: string };
type PrincipalEventFact = { id: number; loanId: number; eventKind: string; amount: unknown; reversesEventId: number | null; idempotencyKey: string };

export interface TreasuryValidationDeps {
  company(id: number): Promise<CompanyFact | null>;
  period(id: number): Promise<PeriodFact | null>;
  bankAccount(id: number): Promise<OwnedFact | null>;
  reconciliation(id: number): Promise<OwnedFact | null>;
  loan(id: number): Promise<OwnedFact | null>;
  interestWorkpaper(id: number): Promise<OwnedFact | null>;
  partyExists(id: number): Promise<boolean>;
  account(id: number): Promise<{ id: number; companyCode: string; year: number | null; isActive: boolean } | null>;
  voucherItems(ids: number[]): Promise<VoucherFact[]>;
  principalEvent(id: number): Promise<PrincipalEventFact | null>;
  principalEventByKey(key: string): Promise<PrincipalEventFact | null>;
  eventWasReversed(id: number): Promise<boolean>;
}

type TreasuryCreateCommand = { input: TreasuryCreateInput; userId: number; idempotentRecordId?: number };
type TreasuryUpdateCommand = { input: TreasuryUpdateInput; userId: number };

function validDate(value: string | null | undefined) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
function dateOrder(from: string, through?: string | null) {
  return !through || from <= through;
}
function uniquePositive(values: number[]) {
  return values.every((value) => Number.isInteger(value) && value > 0) && new Set(values).size === values.length;
}
async function validateCompany(companyId: number, companyCode: string, deps: TreasuryValidationDeps) {
  const company = await deps.company(companyId);
  if (!company || company.code !== companyCode || !company.isActive) return failCommand("公司不存在、不启用或与 companyCode 不一致", 400, "companyId");
  return okCommand(company);
}
async function validatePeriod(periodId: number, companyCode: string, year: number, month: number, deps: TreasuryValidationDeps) {
  const period = await deps.period(periodId);
  if (!period || period.companyCode !== companyCode || period.year !== year || period.month !== month) return failCommand("会计期间不存在或不属于当前公司/年月", 400, "periodId");
  if (period.isClosed) return failCommand("会计期间已关闭，不能修改资金工作底稿", 409, "periodId");
  return okCommand(period);
}
async function validateVouchers(ids: Array<number | null | undefined>, companyCode: string, deps: TreasuryValidationDeps) {
  const uniqueIds = [...new Set(ids.filter((id): id is number => Boolean(id)))];
  const rows = await deps.voucherItems(uniqueIds);
  if (rows.length !== uniqueIds.length || rows.some((row) => row.companyCode !== companyCode)) return failCommand("凭证明细不存在或不属于当前公司", 400, "voucherItemId");
  return okCommand(rows);
}

export async function validateBankAccountCreate(input: Extract<TreasuryCreateInput, { kind: "bank_account_create" }>, deps: TreasuryValidationDeps) {
  const company = await validateCompany(input.companyId, input.companyCode, deps); if (!company.ok) return company;
  if (!validDate(input.openedOn) || !validDate(input.closedOn) || (input.openedOn && !dateOrder(input.openedOn, input.closedOn))) return failCommand("银行账户日期范围无效", 400, "closedOn");
  if (input.accountId) {
    const account = await deps.account(input.accountId);
    if (!account || account.companyCode !== input.companyCode || !account.isActive || account.year !== input.accountYear) return failCommand("银行科目不存在或公司/年度/启用状态不匹配", 400, "accountId");
  }
  return okCommand(input);
}

export async function validateBankReconciliation(input: Extract<TreasuryCreateInput, { kind: "bank_reconciliation_create" }> | Extract<TreasuryUpdateInput, { kind: "bank_reconciliation_update" }>, deps: TreasuryValidationDeps) {
  const period = await validatePeriod(input.periodId, input.companyCode, input.year, input.month, deps); if (!period.ok) return period;
  const account = await deps.bankAccount(input.bankAccountId);
  if (!account || account.companyCode !== input.companyCode || account.status !== "active") return failCommand("银行账户不存在、不启用或不属于当前公司", 400, "bankAccountId");
  if (!uniquePositive(input.items.map((item) => item.id ?? item.version ?? Math.random()))) return failCommand("未达项 id/行必须唯一", 400, "items");
  if (input.items.some((item) => item.clearedOn && item.status !== "cleared" || item.status === "cleared" && !item.clearedOn)) return failCommand("cleared 状态与 clearedOn 必须同时提供", 400, "items");
  const vouchers = await validateVouchers(input.items.map((item) => item.voucherItemId), input.companyCode, deps); if (!vouchers.ok) return vouchers;
  const control = calculateBankReconciliation(input);
  if (input.status === "reconciled" && control.difference !== 0) return failCommand("银行对账仍有控制差异，不能标记 reconciled", 409, "status");
  return okCommand(input);
}

export async function validateLoan(input: Extract<TreasuryCreateInput, { kind: "loan_create" }> | Extract<TreasuryUpdateInput, { kind: "loan_update" }>, deps: TreasuryValidationDeps) {
  const company = await validateCompany(input.companyId, input.companyCode, deps); if (!company.ok) return company;
  if (!(await deps.partyExists(input.lenderPartyId))) return failCommand("出借方主体不存在", 400, "lenderPartyId");
  if (!dateOrder(input.startOn, input.endOn)) return failCommand("借款终止日不能早于开始日", 400, "endOn");
  const ordered = [...input.rateTerms].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (!uniquePositive(ordered.map((term) => term.id ?? ordered.indexOf(term) + 1))) return failCommand("利率条款不能重复", 400, "rateTerms");
  for (let index = 0; index < ordered.length; index += 1) {
    const term = ordered[index]!;
    if (term.annualRate < 0 || term.annualRate > 1 || !dateOrder(term.effectiveFrom, term.effectiveThrough)) return failCommand("利率或生效区间无效", 400, "rateTerms");
    if (term.effectiveFrom < input.startOn || input.endOn && (term.effectiveThrough ?? term.effectiveFrom) > input.endOn) return failCommand("利率条款超出借款合同期间", 400, "rateTerms");
    const previous = ordered[index - 1];
    if (previous && (!previous.effectiveThrough || previous.effectiveThrough >= term.effectiveFrom)) return failCommand("利率条款期间重叠", 400, "rateTerms");
    if (term.rateKind === "floating" && !term.benchmark) return failCommand("浮动利率必须提供 benchmark", 400, "benchmark");
  }
  return okCommand(input);
}

export async function validatePrincipalEvent(input: Extract<TreasuryCreateInput, { kind: "principal_event_append" }>, deps: TreasuryValidationDeps) {
  const loan = await deps.loan(input.loanId);
  if (!loan || loan.companyCode !== input.companyCode || loan.status === "cancelled") return failCommand("借款不存在、已取消或不属于当前公司", 400, "loanId");
  const occurredOn = new Date(`${input.occurredOn}T00:00:00Z`);
  if (loan.startOn && occurredOn < loan.startOn || loan.endOn && occurredOn > loan.endOn) return failCommand("本金事件日期超出借款合同期间", 400, "occurredOn");
  const existing = await deps.principalEventByKey(input.idempotencyKey);
  if (existing) {
    if (existing.loanId !== input.loanId || existing.eventKind !== input.eventKind || Number(existing.amount) !== input.amount || existing.reversesEventId !== (input.reversesEventId ?? null)) return failCommand("幂等键已被不同本金事件占用", 409, "idempotencyKey");
    return okCommand({ input, idempotentRecordId: existing.id });
  }
  if (input.eventKind === "reversal") {
    if (!input.reversesEventId) return failCommand("冲销事件必须指定 reversesEventId", 400, "reversesEventId");
    const reversed = await deps.principalEvent(input.reversesEventId);
    if (!reversed || reversed.loanId !== input.loanId || reversed.eventKind === "reversal" || Number(reversed.amount) !== input.amount || await deps.eventWasReversed(reversed.id)) return failCommand("被冲销事件不存在、已冲销、金额不一致或借款不一致", 409, "reversesEventId");
  } else if (input.reversesEventId) return failCommand("非冲销本金事件不能指定 reversesEventId", 400, "reversesEventId");
  const vouchers = await validateVouchers([input.voucherItemId], input.companyCode, deps); if (!vouchers.ok) return vouchers;
  return okCommand({ input });
}

export async function validateInterestWorkpaper(input: Extract<TreasuryCreateInput, { kind: "interest_workpaper_create" }> | Extract<TreasuryUpdateInput, { kind: "interest_workpaper_update" }>, deps: TreasuryValidationDeps) {
  const period = await validatePeriod(input.periodId, input.companyCode, input.year, input.month, deps); if (!period.ok) return period;
  const loan = await deps.loan(input.loanId);
  if (!loan || loan.companyCode !== input.companyCode || loan.status === "cancelled") return failCommand("借款不存在、已取消或不属于当前公司", 400, "loanId");
  if (!uniquePositive(input.lines.map((line) => line.lineNo))) return failCommand("计息明细 lineNo 必须唯一", 400, "lines");
  if (input.lines.some((line) => !dateOrder(line.accrualFrom, line.accrualThrough) || line.annualRate < 0 || line.annualRate > 1)) return failCommand("计息区间或利率无效", 400, "lines");
  const vouchers = await validateVouchers(input.voucherLinks.map((link) => link.voucherItemId), input.companyCode, deps); if (!vouchers.ok) return vouchers;
  const calculation = calculateInterestWorkpaper(input);
  if (input.status === "reconciled" && (calculation.sourceDifference && Math.abs(calculation.sourceDifference) > 0.01 || Math.abs(calculation.voucherDifference) > 0.01)) return failCommand("利息底稿仍有来源或凭证差异，不能标记 reconciled", 409, "status");
  return okCommand(input);
}

async function validateUpdateTarget(input: TreasuryUpdateInput, deps: TreasuryValidationDeps) {
  const target = input.kind === "bank_account_update" ? await deps.bankAccount(input.id)
    : input.kind === "bank_reconciliation_update" ? await deps.reconciliation(input.id)
      : input.kind === "loan_update" ? await deps.loan(input.id) : await deps.interestWorkpaper(input.id);
  if (!target || target.companyCode !== input.companyCode) return failCommand("目标记录不存在或不属于当前公司", 404, "id");
  if (target.version !== input.version) return failCommand("记录已被其他人修改，请刷新后重试", 409, "version");
  return okCommand(target);
}

export async function buildTreasuryCreateCommand(input: TreasuryCreateInput, userId: number, deps: TreasuryValidationDeps = treasuryValidationDeps): Promise<DomainValidationResult<TreasuryCreateCommand>> {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId");
  if (input.kind === "bank_account_create") { const result = await validateBankAccountCreate(input, deps); return result.ok ? okCommand({ input: result.data, userId }) : result; }
  if (input.kind === "bank_reconciliation_create") { const result = await validateBankReconciliation(input, deps); return result.ok ? okCommand({ input: result.data, userId }) : result; }
  if (input.kind === "loan_create") { const result = await validateLoan(input, deps); return result.ok ? okCommand({ input: result.data, userId }) : result; }
  if (input.kind === "principal_event_append") { const result = await validatePrincipalEvent(input, deps); return result.ok ? okCommand({ ...result.data, userId }) : result; }
  const result = await validateInterestWorkpaper(input, deps); return result.ok ? okCommand({ input: result.data, userId }) : result;
}

export async function buildTreasuryUpdateCommand(input: TreasuryUpdateInput, userId: number, deps: TreasuryValidationDeps = treasuryValidationDeps): Promise<DomainValidationResult<TreasuryUpdateCommand>> {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户身份无效", 400, "userId");
  const target = await validateUpdateTarget(input, deps); if (!target.ok) return target;
  if (input.kind === "bank_account_update") { const result = await validateBankAccountCreate({ ...input, kind: "bank_account_create" }, deps); return result.ok ? okCommand({ input, userId }) : result; }
  if (input.kind === "bank_reconciliation_update") { const result = await validateBankReconciliation(input, deps); return result.ok ? okCommand({ input, userId }) : result; }
  if (input.kind === "loan_update") { const result = await validateLoan(input, deps); return result.ok ? okCommand({ input, userId }) : result; }
  const result = await validateInterestWorkpaper(input, deps); return result.ok ? okCommand({ input, userId }) : result;
}

export function validateTreasuryCreatePersistenceCommand(command: CanonicalTreasuryCreateCommand) {
  return buildCanonicalTreasuryCreateCommand(command.input, command.userId);
}

export function validateTreasuryUpdatePersistenceCommand(command: CanonicalTreasuryUpdateCommand) {
  return buildCanonicalTreasuryUpdateCommand(command.input, command.userId);
}
