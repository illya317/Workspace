import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { createHash } from "node:crypto";
import type {
  BankAccountWriteInput,
  BankReconciliationItemInput,
  BankReconciliationWriteInput,
  DayCountConvention,
  InterestWorkpaperWriteInput,
  LoanRateTermInput,
  LoanWriteInput,
  PrincipalEventAppendInput,
  TreasuryCreateInput,
  TreasuryUpdateInput,
} from "../../types/treasury";
import { calculateBankReconciliation, calculateInterestWorkpaper, TREASURY_CALCULATION_VERSION } from "./calculations";
import { resolveUniqueLoanDayCountConvention } from "./conventions";
import type {
  CompanyReference,
  PeriodReference,
  PrincipalEventReference,
  TreasuryCreateCommand,
  TreasuryUpdateCommand,
  TreasuryValidationDependencies,
} from "./validation-types";

export type { TreasuryCreateCommand, TreasuryUpdateCommand, TreasuryValidationDependencies } from "./validation-types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATE_CONVENTIONS = new Set<DayCountConvention>(["actual_365", "actual_360", "30_360"]);

async function dependencies(overrides: TreasuryValidationDependencies): Promise<Required<TreasuryValidationDependencies>> {
  if (Object.keys(overrides).length === 0) {
    return (await import("./reference-adapter")).defaultTreasuryValidationDependencies;
  }
  const unavailable = async () => { throw new Error("测试未注入所需 Treasury reference dependency"); };
  return new Proxy({ ...overrides }, {
    get(target, property) {
      if (property === "then") return undefined;
      return (target as Record<PropertyKey, unknown>)[property] ?? unavailable;
    },
  }) as Required<TreasuryValidationDependencies>;
}

function validId(value: number) {
  return Number.isInteger(value) && value > 0;
}

function validVersion(value: number) {
  return Number.isInteger(value) && value > 0;
}

function validDate(value: string | null | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function positiveAmount(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1e15;
}

function validAmount(value: number) {
  return Number.isFinite(value) && value !== 0 && Math.abs(value) <= 1e15;
}

function validRate(value: number | null | undefined) {
  return value == null || (Number.isFinite(value) && value >= 0 && value <= 1);
}

async function validateCompany(
  companyCode: string,
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<CompanyReference>> {
  const company = await deps.findCompanyByCode(companyCode.trim());
  if (!company || !company.isActive || company.code !== companyCode.trim()) {
    return failCommand("公司不存在或已停用", 400, "companyCode");
  }
  return okCommand(company);
}

async function validateAccount(
  input: BankAccountWriteInput,
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<CompanyReference>> {
  const company = await validateCompany(input.companyCode, deps);
  if (!company.ok) return company;
  if (input.accountId != null) {
    if (!validId(input.accountId) || !Number.isInteger(input.accountYear)) {
      return failCommand("绑定科目时必须提供有效科目年度", 400, "accountYear");
    }
    const account = await deps.findAccount(input.accountId);
    if (!account || !account.isActive || account.companyCode !== input.companyCode || account.year !== input.accountYear) {
      return failCommand("银行科目不存在、已停用或不属于当前公司和年度", 400, "accountId");
    }
  }
  if (input.openedOn != null && !validDate(input.openedOn)) return failCommand("开户日期无效", 400, "openedOn");
  if (input.closedOn != null && !validDate(input.closedOn)) return failCommand("销户日期无效", 400, "closedOn");
  if (input.openedOn && input.closedOn && input.openedOn > input.closedOn) {
    return failCommand("销户日期不能早于开户日期", 400, "closedOn");
  }
  return company;
}

async function validatePeriodScope(
  input: { companyCode: string; year: number; month: number; periodId: number },
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<PeriodReference>> {
  const period = await deps.findPeriod(input.periodId);
  if (!period || period.companyCode !== input.companyCode || period.year !== input.year || period.month !== input.month) {
    return failCommand("会计期间不存在或不属于当前公司和年月", 400, "periodId");
  }
  if (period.isClosed) return failCommand("会计期间已关闭，不能修改资金底稿", 409, "periodId");
  return okCommand(period);
}

async function validateVoucherOwnership(
  ids: number[],
  companyCode: string,
  periodId: number | null,
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<true>> {
  const uniqueIds = [...new Set(ids)];
  const rows = await deps.findVoucherItems(uniqueIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row || row.companyCode !== companyCode || (periodId != null && row.periodId !== periodId)) {
      return failCommand("凭证明细不存在或不属于当前公司和期间", 400, "voucherItemId");
    }
  }
  return okCommand(true);
}

async function validateReconciliationItems(
  items: BankReconciliationItemInput[],
  input: BankReconciliationWriteInput,
  reconciliationId: number | null,
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<true>> {
  const seenIds = new Set<number>();
  for (const item of items) {
    if (!validAmount(item.amount)) return failCommand("未达项金额必须为有效非零金额", 400, "amount");
    if (item.id != null && (!validId(item.id) || seenIds.has(item.id))) return failCommand("未达项标识重复或无效", 400, "items");
    if (item.id != null) seenIds.add(item.id);
    if (item.occurredOn != null && !validDate(item.occurredOn)) return failCommand("未达项发生日期无效", 400, "occurredOn");
    if (item.clearedOn != null && !validDate(item.clearedOn)) return failCommand("未达项清账日期无效", 400, "clearedOn");
    if (item.occurredOn && item.occurredOn > input.statementDate) return failCommand("未达项发生日期不能晚于对账单日期", 400, "occurredOn");
    if (item.occurredOn && item.clearedOn && item.clearedOn < item.occurredOn) return failCommand("清账日期不能早于发生日期", 400, "clearedOn");
    if (item.id != null && (!validVersion(item.version ?? 0))) return failCommand("更新未达项必须提供有效版本", 400, "version");
  }
  const voucherIds = items.map((item) => item.voucherItemId).filter((id): id is number => id != null);
  const vouchers = await validateVoucherOwnership(voucherIds, input.companyCode, input.periodId, deps);
  if (!vouchers.ok) return vouchers;
  if (seenIds.size > 0) {
    if (reconciliationId == null) return failCommand("新对账单不能引用已有未达项", 400, "items");
    const rows = await deps.findReconciliationItems([...seenIds]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of items) {
      if (item.id == null) continue;
      const row = byId.get(item.id);
      if (!row || row.parentId !== reconciliationId) return failCommand("未达项不属于当前对账单", 400, "items");
      if (row.version !== item.version) return failCommand("未达项已被其他人修改，请刷新后重试", 409, "version");
    }
  }
  return okCommand(true);
}

async function validateReconciliation(
  input: BankReconciliationWriteInput,
  deps: Required<TreasuryValidationDependencies>,
  update?: { id: number; version: number },
): Promise<DomainValidationResult<true>> {
  const periodResult = await validatePeriodScope(input, deps);
  if (!periodResult.ok) return periodResult;
  const bankAccount = await deps.findBankAccount(input.bankAccountId);
  if (!bankAccount || bankAccount.companyCode !== input.companyCode) {
    return failCommand("银行账户不存在或不属于当前公司", 400, "bankAccountId");
  }
  if (!validDate(input.statementDate) || input.statementDate < periodResult.data.startDate || input.statementDate > periodResult.data.endDate) {
    return failCommand("对账单日期必须在当前会计期间内", 400, "statementDate");
  }
  if (!Number.isFinite(input.statementEndingBalance)) return failCommand("银行对账单余额无效", 400, "statementEndingBalance");
  if (!Number.isFinite(input.ledgerEndingBalance)) return failCommand("账面余额无效", 400, "ledgerEndingBalance");
  if (update) {
    if (!validId(update.id) || !validVersion(update.version)) return failCommand("对账单版本无效", 400, "version");
    const existing = await deps.findReconciliation(update.id);
    if (!existing || existing.bankAccountId !== input.bankAccountId || existing.periodId !== input.periodId) {
      return failCommand("对账单不存在或不属于当前银行账户和期间", 404, "id");
    }
    if (existing.version !== update.version) return failCommand("对账单已被其他人修改，请刷新后重试", 409, "version");
  }
  const items = await validateReconciliationItems(input.items, input, update?.id ?? null, deps);
  if (!items.ok) return items;
  const calculation = calculateBankReconciliation(input);
  if (input.status === "reconciled" && Math.abs(calculation.difference) > 0.01) {
    return failCommand("银行对账仍有差额，不能标记为已核对", 400, "status");
  }
  return okCommand(true);
}

function validateRateTerms(
  terms: LoanRateTermInput[],
  loan: Pick<LoanWriteInput, "startOn" | "endOn">,
): DomainValidationResult<true> {
  const ids = new Set<number>();
  const starts = new Set<string>();
  const sorted = [...terms].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const term of sorted) {
    if (!validDate(term.effectiveFrom)) return failCommand("利率条款生效日期无效", 400, "effectiveFrom");
    if (term.effectiveThrough != null && !validDate(term.effectiveThrough)) return failCommand("利率条款截止日期无效", 400, "effectiveThrough");
    if (term.effectiveThrough && term.effectiveFrom > term.effectiveThrough) return failCommand("利率条款截止日期不能早于生效日期", 400, "effectiveThrough");
    if (term.effectiveFrom < loan.startOn || (loan.endOn && (term.effectiveThrough ?? term.effectiveFrom) > loan.endOn)) {
      return failCommand("利率条款日期必须在借款合同期限内", 400, "effectiveFrom");
    }
    if (!validRate(term.annualRate) || !validRate(term.spreadRate)) return failCommand("借款利率必须在 0 到 1 之间", 400, "annualRate");
    if (!RATE_CONVENTIONS.has(term.dayCountConvention)) return failCommand("计息天数口径无效", 400, "dayCountConvention");
    if (term.rateKind === "floating" && !term.benchmark?.trim()) return failCommand("浮动利率必须填写基准利率", 400, "benchmark");
    if (starts.has(term.effectiveFrom)) return failCommand("同一生效日不能有多个利率条款", 400, "rateTerms");
    starts.add(term.effectiveFrom);
    if (term.id != null) {
      if (!validId(term.id) || ids.has(term.id)) return failCommand("利率条款标识重复或无效", 400, "rateTerms");
      ids.add(term.id);
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    if (!previous.effectiveThrough || previous.effectiveThrough >= sorted[index].effectiveFrom) {
      return failCommand("利率条款期间不能重叠", 400, "rateTerms");
    }
  }
  return okCommand(true);
}

async function validateLoan(
  input: LoanWriteInput,
  deps: Required<TreasuryValidationDependencies>,
  update?: { id: number; version: number },
): Promise<DomainValidationResult<CompanyReference>> {
  const company = await validateCompany(input.companyCode, deps);
  if (!company.ok) return company;
  if (!await deps.findParty(input.lenderPartyId)) return failCommand("贷款方主体不存在", 400, "lenderPartyId");
  if (!positiveAmount(input.contractPrincipalAmount)) return failCommand("合同本金必须大于零", 400, "contractPrincipalAmount");
  if (!validDate(input.startOn)) return failCommand("合同开始日期无效", 400, "startOn");
  if (input.endOn != null && !validDate(input.endOn)) return failCommand("合同结束日期无效", 400, "endOn");
  if (input.endOn && input.startOn > input.endOn) return failCommand("合同结束日期不能早于开始日期", 400, "endOn");
  const rates = validateRateTerms(input.rateTerms, input);
  if (!rates.ok) return rates;
  if (update) {
    if (!validId(update.id) || !validVersion(update.version)) return failCommand("借款版本无效", 400, "version");
    const existing = await deps.findLoan(update.id);
    if (!existing || existing.companyId !== company.data.id || existing.companyCode !== input.companyCode) {
      return failCommand("借款不存在或不属于当前公司", 404, "id");
    }
    if (existing.version !== update.version) return failCommand("借款已被其他人修改，请刷新后重试", 409, "version");
    const ids = input.rateTerms.map((term) => term.id).filter((id): id is number => id != null);
    const rows = await deps.findRateTerms(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of ids) if (byId.get(id)?.loanId !== update.id) return failCommand("利率条款不属于当前借款", 400, "rateTerms");
  } else if (input.rateTerms.some((term) => term.id != null)) {
    return failCommand("新借款不能引用已有利率条款", 400, "rateTerms");
  }
  return company;
}

function interestCalculation(input: InterestWorkpaperWriteInput) {
  const canonical = {
    loanId: input.loanId,
    periodId: input.periodId,
    dayCountConvention: input.dayCountConvention,
    lines: [...input.lines].sort((left, right) => left.lineNo - right.lineNo).map((line) => ({
      lineNo: line.lineNo,
      accrualFrom: line.accrualFrom,
      accrualThrough: line.accrualThrough,
      principalBasis: line.principalBasis,
      annualRate: line.annualRate,
      dayCount: line.dayCount,
      sourceReportedInterestAmount: line.sourceReportedInterestAmount ?? null,
    })),
    voucherLinks: [...input.voucherLinks].map((link) => ({
      voucherItemId: link.voucherItemId,
      linkKind: link.linkKind,
      amount: link.amount,
    })).sort((left, right) => left.voucherItemId - right.voucherItemId || left.linkKind.localeCompare(right.linkKind)),
  };
  return {
    calculationVersion: TREASURY_CALCULATION_VERSION,
    inputFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
  };
}

function expectedDayCount(from: string, through: string, convention: DayCountConvention) {
  if (convention === "30_360") {
    const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
    const [toYear, toMonth, toDay] = through.split("-").map(Number);
    return (toYear - fromYear) * 360 + (toMonth - fromMonth) * 30 + Math.max(0, Math.min(30, toDay) - Math.min(30, fromDay)) + 1;
  }
  return Math.round((Date.parse(`${through}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
}

async function validatePrincipalEvent(
  input: PrincipalEventAppendInput,
  deps: Required<TreasuryValidationDependencies>,
): Promise<DomainValidationResult<{ idempotentPrincipalEventId?: number }>> {
  const periodResult = await validatePeriodScope(input, deps);
  if (!periodResult.ok) return periodResult;
  const loan = await deps.findLoan(input.loanId);
  if (!loan || loan.companyCode !== input.companyCode) return failCommand("借款不存在或不属于当前公司", 404, "loanId");
  if (!positiveAmount(input.amount)) return failCommand("本金事件金额必须大于零", 400, "amount");
  if (!validDate(input.occurredOn) || input.occurredOn < periodResult.data.startDate || input.occurredOn > periodResult.data.endDate) {
    return failCommand("本金事件日期必须在当前会计期间内", 400, "occurredOn");
  }
  if (input.occurredOn < dateText(loan.startOn) || (loan.endOn && input.occurredOn > dateText(loan.endOn))) {
    return failCommand("本金事件日期必须在借款合同期限内", 400, "occurredOn");
  }
  if (input.voucherItemId != null) {
    const vouchers = await validateVoucherOwnership([input.voucherItemId], input.companyCode, input.periodId, deps);
    if (!vouchers.ok) return vouchers;
  }
  const existing = await deps.findPrincipalEventByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (!principalEventMatchesInput(existing, input)) return failCommand("幂等键已用于不同的本金事件", 409, "idempotencyKey");
    return okCommand({ idempotentPrincipalEventId: existing.id });
  }
  if (input.eventKind !== "reversal" && input.reversesEventId != null) {
    return failCommand("只有冲销事件可以引用被冲销事件", 400, "reversesEventId");
  }
  if (input.eventKind === "reversal") {
    if (!validId(input.reversesEventId ?? 0)) return failCommand("冲销事件必须引用原本金事件", 400, "reversesEventId");
    const reversed = await deps.findPrincipalEvent(input.reversesEventId!);
    if (!reversed || reversed.loanId !== input.loanId || reversed.eventKind === "reversal") {
      return failCommand("被冲销事件不存在、不属于当前借款或本身是冲销事件", 400, "reversesEventId");
    }
    if (input.amount !== Number(reversed.amount)) return failCommand("冲销金额必须等于原本金事件金额", 400, "amount");
    if (input.occurredOn < dateText(reversed.occurredOn)) return failCommand("冲销日期不能早于原本金事件日期", 400, "occurredOn");
    if (await deps.hasReversal(reversed.id)) return failCommand("原本金事件已经被冲销", 409, "reversesEventId");
  }
  return okCommand({});
}

function nullable(value: string | number | null | undefined) {
  return value ?? null;
}

export function principalEventMatchesInput(existing: PrincipalEventReference, input: PrincipalEventAppendInput) {
  return existing.loanId === input.loanId
    && existing.voucherItemId === (input.voucherItemId ?? null)
    && existing.eventKind === input.eventKind
    && dateText(existing.occurredOn) === input.occurredOn
    && Number(existing.amount) === input.amount
    && nullable(existing.referenceNo) === nullable(input.referenceNo)
    && nullable(existing.note) === nullable(input.note)
    && existing.reversesEventId === (input.reversesEventId ?? null)
    && nullable(existing.sourceKind) === nullable(input.sourceKind)
    && nullable(existing.sourceReleaseId) === nullable(input.sourceReleaseId)
    && nullable(existing.sourceSha256) === nullable(input.sourceSha256)
    && nullable(existing.sourceFile) === nullable(input.sourceFile)
    && nullable(existing.sourceSheet) === nullable(input.sourceSheet)
    && nullable(existing.sourceRow) === nullable(input.sourceRow)
    && nullable(existing.sourceRange) === nullable(input.sourceRange)
    && nullable(existing.sourceKey) === nullable(input.sourceKey);
}

async function validateInterestWorkpaper(
  input: InterestWorkpaperWriteInput,
  deps: Required<TreasuryValidationDependencies>,
  update?: { id: number; version: number },
): Promise<DomainValidationResult<true>> {
  const periodResult = await validatePeriodScope(input, deps);
  if (!periodResult.ok) return periodResult;
  const loan = await deps.findLoan(input.loanId);
  if (!loan || loan.companyCode !== input.companyCode) return failCommand("借款不存在或不属于当前公司", 404, "loanId");
  if (!RATE_CONVENTIONS.has(input.dayCountConvention)) return failCommand("计息天数口径无效", 400, "dayCountConvention");
  const contractConvention = resolveUniqueLoanDayCountConvention(loan.rateTermConventions);
  if (!contractConvention) return failCommand("借款合同计息天数口径缺失或不唯一", 400, "dayCountConvention");
  if (contractConvention !== input.dayCountConvention) {
    return failCommand("底稿计息天数口径与借款合同不一致", 400, "dayCountConvention");
  }
  const lineIds = new Set<number>();
  const lineNumbers = new Set<number>();
  for (const line of input.lines) {
    if (line.id != null && (!validId(line.id) || lineIds.has(line.id))) return failCommand("利息行标识重复或无效", 400, "lines");
    if (line.id != null) lineIds.add(line.id);
    if (!validId(line.lineNo) || lineNumbers.has(line.lineNo)) return failCommand("利息行号重复或无效", 400, "lineNo");
    lineNumbers.add(line.lineNo);
    if (!validDate(line.accrualFrom) || !validDate(line.accrualThrough) || line.accrualFrom > line.accrualThrough) {
      return failCommand("计息起止日期无效", 400, "accrualThrough");
    }
    if (line.accrualFrom < periodResult.data.startDate || line.accrualThrough > periodResult.data.endDate) {
      return failCommand("计息行日期必须在当前会计期间内", 400, "accrualFrom");
    }
    if (!Number.isFinite(line.principalBasis) || line.principalBasis < 0) return failCommand("计息本金无效", 400, "principalBasis");
    if (!validRate(line.annualRate)) return failCommand("计息年利率必须在 0 到 1 之间", 400, "annualRate");
    if (line.dayCount !== expectedDayCount(line.accrualFrom, line.accrualThrough, input.dayCountConvention)) {
      return failCommand("计息天数与起止日期及口径不一致", 400, "dayCount");
    }
  }
  const linkIds = new Set<number>();
  for (const link of input.voucherLinks) {
    if (link.id != null && (!validId(link.id) || linkIds.has(link.id))) return failCommand("凭证链接标识重复或无效", 400, "voucherLinks");
    if (link.id != null) linkIds.add(link.id);
    if (!positiveAmount(link.amount)) return failCommand("凭证链接金额必须大于零", 400, "amount");
  }
  const vouchers = await validateVoucherOwnership(input.voucherLinks.map((link) => link.voucherItemId), input.companyCode, input.periodId, deps);
  if (!vouchers.ok) return vouchers;
  const calculation = calculateInterestWorkpaper(input);
  if (input.status === "reconciled"
    && ((calculation.sourceDifference != null && Math.abs(calculation.sourceDifference) > 0.01)
      || Math.abs(calculation.voucherDifference) > 0.01)) {
    return failCommand("利息底稿仍有来源或凭证差额，不能标记为已核对", 400, "status");
  }
  if (update) {
    if (!validId(update.id) || !validVersion(update.version)) return failCommand("利息底稿版本无效", 400, "version");
    const existing = await deps.findWorkpaper(update.id);
    if (!existing || existing.loanId !== input.loanId || existing.periodId !== input.periodId) {
      return failCommand("利息底稿不存在或不属于当前借款和期间", 404, "id");
    }
    if (existing.version !== update.version) return failCommand("利息底稿已被其他人修改，请刷新后重试", 409, "version");
    const [lines, links] = await Promise.all([
      deps.findWorkpaperLines([...lineIds]),
      deps.findVoucherLinks([...linkIds]),
    ]);
    if (lines.some((line) => line.parentId !== update.id) || lines.length !== lineIds.size) return failCommand("利息行不属于当前底稿", 400, "lines");
    if (links.some((link) => link.parentId !== update.id) || links.length !== linkIds.size) return failCommand("凭证链接不属于当前底稿", 400, "voucherLinks");
  } else if (lineIds.size > 0 || linkIds.size > 0) {
    return failCommand("新利息底稿不能引用已有明细", 400, "lines");
  }
  return okCommand(true);
}

export async function buildTreasuryCreateCommand(
  input: TreasuryCreateInput,
  userId: number,
  overrides: TreasuryValidationDependencies = {},
): Promise<DomainValidationResult<TreasuryCreateCommand>> {
  const deps = await dependencies(overrides);
  if (!validId(userId)) return failCommand("操作用户无效", 400, "userId");
  if (input.kind === "bank_account_create") {
    const result = await validateAccount(input, deps);
    if (!result.ok) return result;
    return okCommand({ input, userId, companyId: result.data.id });
  } else if (input.kind === "bank_reconciliation_create") {
    const result = await validateReconciliation(input, deps);
    if (!result.ok) return result;
  } else if (input.kind === "loan_create") {
    const result = await validateLoan(input, deps);
    if (!result.ok) return result;
    return okCommand({ input, userId, companyId: result.data.id });
  } else if (input.kind === "principal_event_append") {
    const result = await validatePrincipalEvent(input, deps);
    if (!result.ok) return result;
    return okCommand({ input, userId, ...result.data });
  } else {
    const result = await validateInterestWorkpaper(input, deps);
    if (!result.ok) return result;
    return okCommand({ input, userId, calculation: interestCalculation(input) });
  }
  return okCommand({ input, userId });
}

export async function buildTreasuryUpdateCommand(
  input: TreasuryUpdateInput,
  userId: number,
  overrides: TreasuryValidationDependencies = {},
): Promise<DomainValidationResult<TreasuryUpdateCommand>> {
  const deps = await dependencies(overrides);
  if (!validId(userId)) return failCommand("操作用户无效", 400, "userId");
  if (input.kind === "bank_account_update") {
    if (!validId(input.id) || !validVersion(input.version)) return failCommand("银行账户版本无效", 400, "version");
    const existing = await deps.findBankAccount(input.id);
    const company = await validateCompany(input.companyCode, deps);
    if (!company.ok) return company;
    if (!existing || existing.companyId !== company.data.id || existing.companyCode !== input.companyCode) {
      return failCommand("银行账户不存在或不属于当前公司", 404, "id");
    }
    if (existing.version !== input.version) return failCommand("银行账户已被其他人修改，请刷新后重试", 409, "version");
    const result = await validateAccount(input, deps);
    if (!result.ok) return result;
    return okCommand({ input, userId, companyId: result.data.id });
  } else if (input.kind === "bank_reconciliation_update") {
    const result = await validateReconciliation(input, deps, input);
    if (!result.ok) return result;
  } else if (input.kind === "loan_update") {
    const result = await validateLoan(input, deps, input);
    if (!result.ok) return result;
    return okCommand({ input, userId, companyId: result.data.id });
  } else {
    const result = await validateInterestWorkpaper(input, deps, input);
    if (!result.ok) return result;
    return okCommand({ input, userId, calculation: interestCalculation(input) });
  }
  return okCommand({ input, userId });
}
