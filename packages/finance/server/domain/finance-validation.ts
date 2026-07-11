import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface FinanceIdCommand {
  id: number;
}

export interface FinancePeriodScopeCommand {
  companyCode: string;
  year: number;
  month?: number;
}

export interface FinanceRowsCommand<T> {
  id: number;
  rows: T[];
}

export interface FinanceImportCommand<T> {
  data: T;
}

const REPORT_TYPES = new Set(["balanceSheet", "incomeStatement", "cashFlow", "balance"]);
const REVIEW_LINE_STATUSES = new Set(["pending", "confirmed", "adjusted", "flagged"]);
const RECLASS_ACTIONS = new Set(["approve", "adjust", "revert", "mark_pending"]);
const RECLASS_SIDES = new Set(["debit", "credit", "both"]);

export function positiveId(value: unknown, field = "id"): DomainValidationResult<number> {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand(`${field} must be a positive integer`, 400, field);
  return okCommand(id);
}

export function validYear(value: unknown, field = "year"): DomainValidationResult<number> {
  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2099) return failCommand(`${field} must be 2020..2099`, 400, field);
  return okCommand(year);
}

export function validMonth(value: unknown, field = "month"): DomainValidationResult<number> {
  const month = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return failCommand(`${field} must be 1..12`, 400, field);
  return okCommand(month);
}

export function requiredText(value: unknown, field: string): DomainValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) return failCommand(`${field} is required`, 400, field);
  return okCommand(value.trim());
}

export function finiteNumber(value: unknown, field: string): DomainValidationResult<number> {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return failCommand(`${field} must be a finite number`, 400, field);
  return okCommand(number);
}

export function buildSideBalanceAddCommand(code: unknown, debit: unknown, credit: unknown) {
  const accountCode = requiredText(code, "accountCode");
  if (!accountCode.ok) return accountCode;
  const debitValue = finiteNumber(debit, "debit");
  if (!debitValue.ok) return debitValue;
  const creditValue = finiteNumber(credit, "credit");
  if (!creditValue.ok) return creditValue;
  return okCommand({ code: accountCode.data, debit: debitValue.data, credit: creditValue.data });
}

export function buildFinanceIdCommand(value: unknown, field = "id"): DomainValidationResult<FinanceIdCommand> {
  const id = positiveId(value, field);
  if (!id.ok) return id;
  return okCommand({ id: id.data });
}

export function buildFinancePeriodScopeCommand(input: {
  companyCode: unknown;
  year: unknown;
  month?: unknown;
}): DomainValidationResult<FinancePeriodScopeCommand> {
  const companyCode = requiredText(input.companyCode, "companyCode");
  if (!companyCode.ok) return companyCode;
  const year = validYear(input.year);
  if (!year.ok) return year;
  if (input.month === undefined) return okCommand({ companyCode: companyCode.data, year: year.data });
  const month = validMonth(input.month);
  if (!month.ok) return month;
  return okCommand({ companyCode: companyCode.data, year: year.data, month: month.data });
}

export function buildBudgetVersionCreateCommand<T extends { year: number; name: string; type: string }>(
  input: T,
): DomainValidationResult<FinanceImportCommand<T>> {
  const year = validYear(input.year);
  if (!year.ok) return year;
  const name = requiredText(input.name, "name");
  if (!name.ok) return name;
  if (!["dept", "rd", "all"].includes(input.type)) return failCommand("预算版本类型无效", 400, "type");
  return okCommand({ data: { ...input, year: year.data, name: name.data } });
}

export function buildBudgetImportCommand(input: {
  year: number;
  companyCode?: string;
  versionId?: number;
}): DomainValidationResult<{ year: number; companyCode?: string; versionId?: number }> {
  const year = validYear(input.year);
  if (!year.ok) return year;
  if (input.versionId !== undefined) {
    const versionId = positiveId(input.versionId, "versionId");
    if (!versionId.ok) return versionId;
    return okCommand({ ...input, year: year.data, versionId: versionId.data });
  }
  return okCommand({ ...input, year: year.data });
}

export function buildFinanceDataImportCommand<T extends {
  profile: string;
  sourceFile: string;
  recordCount: number;
  warningCount: number;
  errorCount: number;
}>(data: T): DomainValidationResult<FinanceImportCommand<T>> {
  const profile = requiredText(data.profile, "profile");
  if (!profile.ok) return profile;
  const sourceFile = requiredText(data.sourceFile, "sourceFile");
  if (!sourceFile.ok) return sourceFile;
  for (const field of ["recordCount", "warningCount", "errorCount"] as const) {
    const count = finiteNumber(data[field], field);
    if (!count.ok) return count;
    if (count.data < 0) return failCommand(`${field} must be non-negative`, 400, field);
  }
  return okCommand({ data: { ...data, profile: profile.data, sourceFile: sourceFile.data } });
}

export function buildFinanceRowsCommand<T>(
  importId: unknown,
  rows: T[],
  field = "importId",
): DomainValidationResult<FinanceRowsCommand<T>> {
  const id = positiveId(importId, field);
  if (!id.ok) return id;
  if (!Array.isArray(rows)) return failCommand("rows must be an array", 400, "rows");
  return okCommand({ id: id.data, rows });
}

export function buildConfirmFinanceImportCommand(preview: {
  errors?: unknown[];
  companyCode?: string;
  year?: number;
  type?: string;
} | null | undefined): DomainValidationResult<{ preview: NonNullable<typeof preview> }> {
  if (!preview) return failCommand("预览数据有误，无法导入");
  if (Array.isArray(preview.errors) && preview.errors.length > 0) return failCommand("预览数据有误，无法导入");
  const scope = buildFinancePeriodScopeCommand({ companyCode: preview.companyCode, year: preview.year });
  if (!scope.ok) return scope;
  if (!["account", "balance", "voucher"].includes(String(preview.type))) return failCommand("导入类型无效", 400, "type");
  return okCommand({ preview });
}

export function buildVoucherImportCommand(input: {
  companyCode?: string;
  year?: number;
  vouchers?: unknown[];
}, importId: unknown): DomainValidationResult<{ importId: number }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year });
  if (!scope.ok) return scope;
  const id = positiveId(importId, "importId");
  if (!id.ok) return id;
  if (input.vouchers !== undefined && !Array.isArray(input.vouchers)) return failCommand("vouchers must be an array", 400, "vouchers");
  return okCommand({ importId: id.data });
}

export function buildFinanceAccountCreateCommand<T extends { code: string; name: string; category: string }>(
  input: T,
  userId: unknown,
): DomainValidationResult<{ input: T; userId: number }> {
  for (const field of ["code", "name", "category"] as const) {
    const value = requiredText(input[field], field);
    if (!value.ok) return value;
  }
  const editor = positiveId(userId, "userId");
  if (!editor.ok) return editor;
  return okCommand({ input, userId: editor.data });
}

export function buildFinanceAccountUpdateCommand<T>(
  id: unknown,
  input: T,
  userId: unknown,
): DomainValidationResult<{ id: number; input: T; userId: number }> {
  const accountId = positiveId(id);
  if (!accountId.ok) return accountId;
  const editor = positiveId(userId, "userId");
  if (!editor.ok) return editor;
  return okCommand({ id: accountId.data, input, userId: editor.data });
}

export function buildBalanceSnapshotCommand<T>(
  input: T,
  accountCodeToId?: Map<string, number>,
): DomainValidationResult<{ input: T; accountCodeToId?: Map<string, number> }> {
  if (accountCodeToId && !(accountCodeToId instanceof Map)) return failCommand("accountCodeToId must be a Map", 400);
  return okCommand({ input, accountCodeToId });
}

export function buildBalanceComputeCommand(periodId: unknown): DomainValidationResult<FinanceIdCommand> {
  return buildFinanceIdCommand(periodId, "periodId");
}

export function buildBalanceRangeCommand(input: {
  companyCode: unknown;
  year: unknown;
  monthStart: unknown;
  monthEnd: unknown;
}): DomainValidationResult<{ companyCode: string; year: number; monthStart: number; monthEnd: number }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year });
  if (!scope.ok) return scope;
  const monthStart = validMonth(input.monthStart, "monthStart");
  if (!monthStart.ok) return monthStart;
  const monthEnd = validMonth(input.monthEnd, "monthEnd");
  if (!monthEnd.ok) return monthEnd;
  if (monthStart.data > monthEnd.data) return failCommand("monthStart cannot be after monthEnd", 400);
  return okCommand({ ...scope.data, monthStart: monthStart.data, monthEnd: monthEnd.data });
}

export function buildFinancePeriodCreateCommand<T extends { year: number; month: number; companyCode?: string }>(
  input: T,
): DomainValidationResult<{ input: T & { year: number; month: number; companyCode: string } }> {
  const year = validYear(input.year);
  if (!year.ok) return year;
  const month = validMonth(input.month);
  if (!month.ok) return month;
  return okCommand({ input: { ...input, year: year.data, month: month.data, companyCode: input.companyCode || "" } });
}

export function buildFinancePeriodUpdateCommand<T>(
  id: unknown,
  input: T,
): DomainValidationResult<{ id: number; input: T }> {
  const periodId = positiveId(id);
  if (!periodId.ok) return periodId;
  return okCommand({ id: periodId.data, input });
}

export function buildReclassReviewCommand<T extends { id?: number; payload?: { action?: string }; userId?: number }>(
  params: T,
): DomainValidationResult<{ params: T }> {
  const id = positiveId(params.id, "id");
  if (!id.ok) return id;
  const userId = positiveId(params.userId, "userId");
  if (!userId.ok) return userId;
  if (!RECLASS_ACTIONS.has(String(params.payload?.action))) return failCommand("无效的审核动作", 400, "action");
  return okCommand({ params });
}

export function buildManualReclassCommand<T extends {
  periodId: number;
  voucherItemId: number;
  targetAccount: string;
  amount: number;
  userId: number;
}>(params: T): DomainValidationResult<{ params: T }> {
  for (const field of ["periodId", "voucherItemId", "userId"] as const) {
    const id = positiveId(params[field], field);
    if (!id.ok) return id;
  }
  const target = requiredText(params.targetAccount, "targetAccount");
  if (!target.ok) return target;
  const amount = finiteNumber(params.amount, "amount");
  if (!amount.ok) return amount;
  if (amount.data <= 0) return failCommand("金额必须大于 0", 400, "amount");
  return okCommand({ params: { ...params, targetAccount: target.data, amount: amount.data } });
}

export function buildReclassRuleScopeCommand(companyCode: unknown, year: unknown): DomainValidationResult<FinancePeriodScopeCommand> {
  return buildFinancePeriodScopeCommand({ companyCode, year });
}

export function buildUpsertReclassRuleCommand<T extends {
  companyCode: string;
  year: number;
  sourceAccountCode: string;
  abnormalSide: string;
  targetAccountCode: string;
}>(input: T): DomainValidationResult<{ input: T }> {
  const scope = buildReclassRuleScopeCommand(input.companyCode, input.year);
  if (!scope.ok) return scope;
  for (const field of ["sourceAccountCode", "targetAccountCode"] as const) {
    const text = requiredText(input[field], field);
    if (!text.ok) return text;
  }
  if (!RECLASS_SIDES.has(input.abnormalSide)) return failCommand("异常方向无效", 400, "abnormalSide");
  return okCommand({ input });
}

export function buildReclassBuildCommand(periodId: unknown): DomainValidationResult<FinanceIdCommand> {
  return buildFinanceIdCommand(periodId, "periodId");
}

export function buildVoucherWriteCommand(body: Record<string, unknown>, editorId: unknown): DomainValidationResult<{ body: Record<string, unknown>; editorId: number }> {
  const editor = positiveId(editorId, "editorId");
  if (!editor.ok) return editor;
  if (!body || typeof body !== "object" || Array.isArray(body)) return failCommand("请求体必须为对象", 400);
  return okCommand({ body, editorId: editor.data });
}

export function buildVoucherUpdateCommand(voucherId: unknown, body: Record<string, unknown>, editorId: unknown) {
  const id = positiveId(voucherId, "voucherId");
  if (!id.ok) return id;
  const write = buildVoucherWriteCommand(body, editorId);
  if (!write.ok) return write;
  return okCommand({ voucherId: id.data, body: write.data.body, editorId: write.data.editorId });
}

export function buildStatementConfigLoadCommand(companyCode: unknown, year: unknown) {
  return buildFinancePeriodScopeCommand({ companyCode, year });
}

export function buildStatementMappingCommand<T extends {
  companyCode: string;
  year: number;
  statementType?: string;
  accountCode?: string;
  lineCode?: string;
  operator?: string;
}>(input: T, options: { requireAccount?: boolean; requireLine?: boolean } = {}): DomainValidationResult<{ input: T }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year });
  if (!scope.ok) return scope;
  if (input.statementType && input.statementType !== "balance") return failCommand("statementType 暂只支持 balance", 400, "statementType");
  if (options.requireAccount || input.accountCode !== undefined) {
    const accountCode = requiredText(input.accountCode, "accountCode");
    if (!accountCode.ok) return accountCode;
  }
  if (options.requireLine || input.lineCode !== undefined) {
    const lineCode = requiredText(input.lineCode, "lineCode");
    if (!lineCode.ok) return lineCode;
  }
  if (input.operator && !["add", "subtract", "exclude"].includes(input.operator)) {
    return failCommand("operator 无效", 400, "operator");
  }
  return okCommand({ input });
}

export function buildStatementMappingDeleteCommand<T extends {
  companyCode: string;
  year: number;
  statementType?: string;
  accountCode?: string;
}>(input: T): DomainValidationResult<{ input: T & { accountCode: string } }> {
  const command = buildStatementMappingCommand(input, { requireAccount: true });
  if (!command.ok) return command;
  return okCommand({
    input: {
      ...input,
      accountCode: command.data.input.accountCode!,
    },
  });
}

export function buildReviewGenerateCommand(workpaperId: unknown, userId?: unknown) {
  const id = positiveId(workpaperId, "workpaperId");
  if (!id.ok) return id;
  if (userId !== undefined) {
    const user = positiveId(userId, "userId");
    if (!user.ok) return user;
  }
  return okCommand({ workpaperId: id.data, userId: userId === undefined ? undefined : Number(userId) });
}

export function buildReviewUpdateCommand(reviewId: unknown, lines: unknown[], userId?: unknown) {
  const id = positiveId(reviewId, "reviewId");
  if (!id.ok) return id;
  if (!Array.isArray(lines)) return failCommand("lines must be an array", 400, "lines");
  if (userId !== undefined) {
    const user = positiveId(userId, "userId");
    if (!user.ok) return user;
  }
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return failCommand("review line must be an object", 400, "lines");
    const status = (line as { status?: unknown }).status;
    if (status && !REVIEW_LINE_STATUSES.has(String(status))) return failCommand(`无效 status "${status}"`, 400, "status");
    const adjustedAmount = (line as { adjustedAmount?: unknown }).adjustedAmount;
    if (adjustedAmount !== undefined && adjustedAmount !== null) {
      const amount = finiteNumber(adjustedAmount, "adjustedAmount");
      if (!amount.ok) return amount;
    }
  }
  return okCommand({ reviewId: id.data, lines, userId: userId === undefined ? undefined : Number(userId) });
}

export function buildReportTypeCommand(reportType: unknown) {
  const text = requiredText(reportType, "reportType");
  if (!text.ok) return text;
  if (!REPORT_TYPES.has(text.data)) return failCommand("reportType 无效", 400, "reportType");
  return okCommand({ reportType: text.data });
}

export function buildStatementConfigLinesCommand<T extends { companyCode: string; year: number; lines: unknown[] }>(
  input: T,
): DomainValidationResult<{ input: T }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year });
  if (!scope.ok) return scope;
  if (!Array.isArray(input.lines)) return failCommand("lines must be an array", 400, "lines");
  for (const line of input.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return failCommand("line must be an object", 400, "lines");
    const lineCode = requiredText((line as { lineCode?: unknown }).lineCode, "lineCode");
    if (!lineCode.ok) return lineCode;
  }
  return okCommand({ input });
}

export function buildWorkpaperSaveCommand<T extends {
  companyCode: string;
  year: number;
  month: number;
  reportType: string;
  lines: unknown[];
}>(input: T, userId?: unknown): DomainValidationResult<{ input: T; userId?: number }> {
  const scope = buildFinancePeriodScopeCommand({ companyCode: input.companyCode, year: input.year, month: input.month });
  if (!scope.ok) return scope;
  const reportType = buildReportTypeCommand(input.reportType);
  if (!reportType.ok) return reportType;
  if (!Array.isArray(input.lines)) return failCommand("lines must be an array", 400, "lines");
  if (userId !== undefined) {
    const user = positiveId(userId, "userId");
    if (!user.ok) return user;
    return okCommand({ input, userId: user.data });
  }
  return okCommand({ input });
}
