import { serviceError, serviceOk, serviceResponse, type ServiceResult } from "@workspace/platform/server/api";
import {
  isStatementPeriodEnd,
  STATEMENT_PERIOD_KINDS,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";
import { z } from "zod";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { deleteImportById, getImportById, listImports } from "./cost/import";
import { getBudgetAnalysis } from "./analysis/budget-analysis";
import { getFundFlowAnalysis } from "./analysis/fund-flow-analysis";
import { getManagementAnalysis } from "./analysis/management-analysis";
import { deriveRows } from "./ledger/reclass-results/derived";
import { computeReclassification } from "./schedules/reclassify";
import { getReportDetail } from "./statements/report-detail";
import {
  buildFinanceIdCommand,
  buildFinancePeriodScopeCommand,
  buildSaveBalanceReclassAdjustmentChangeSetCommand,
  buildSaveReclassRuleChangeSetCommand,
  type SaveBalanceReclassAdjustmentChangeSetInput,
  type SaveReclassRuleChangeSetInput,
} from "./domain/finance-validation";
import { listFinanceBalances, recomputeFinanceBalances } from "./ledger/balance-api";
import {
  replayFinanceBalanceCutover,
  type FinanceBalanceCutoverReplayScope,
} from "./ledger/balance-cutover-replay";
import {
  listCounterpartyBalances,
  type ListCounterpartyBalancesInput,
} from "./ledger/counterparty-balances";
import { lookupFinancePeriodId, initializeFinanceDefaults } from "./ledger/periods";
import { buildReclassResults } from "./ledger/reclassify";
import { listReclassResults } from "./ledger/reclass-results/list";
import {
  createManualReclassResult,
  reviewReclassResult,
  ReviewError,
} from "./ledger/reclass-results/review";
import {
  manualReclassResultSchema,
  reviewReclassPayloadSchema,
} from "./ledger/reclass-results/schemas";
import { saveReclassRuleChangeSet, scanCandidates } from "./ledger/reclass-rules";
import { saveBalanceReclassAdjustmentChangeSet } from "./ledger/balance-reclass";
import { createVoucher, deleteVoucher, listVouchers, updateVoucher } from "./ledger/voucher-service";
import { voucherPeriodValidationIssue } from "./ledger/voucher-period";
import { generateFinanceReport, type GenerateFinanceReportInput } from "./statements/report-generator";

type FinanceReportType = GenerateFinanceReportInput["reportType"];

export type LookupFinancePeriodCommand =
  | { kind: "empty" }
  | { kind: "lookup"; companyCode: string; year: number; month: number };

export type FinanceReportCommand = GenerateFinanceReportInput;

function statusFrom(error: unknown): number {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return 400;
}

function isFinanceReportType(type: unknown): type is FinanceReportType {
  return type === "balance" || type === "income" || type === "cashflow";
}

export function buildLookupFinancePeriodCommand(input: {
  companyCode?: string;
  year?: number;
  month?: number;
}): DomainValidationResult<LookupFinancePeriodCommand> {
  if (!input.companyCode || input.year === undefined || input.month === undefined) {
    return okCommand({ kind: "empty" });
  }
  const scope = buildFinancePeriodScopeCommand({
    companyCode: input.companyCode,
    year: input.year,
    month: input.month,
  });
  if (!scope.ok) return scope;
  return okCommand({
    kind: "lookup",
    companyCode: scope.data.companyCode,
    year: scope.data.year,
    month: scope.data.month!,
  });
}

export function executeLookupFinancePeriodCommand(command: LookupFinancePeriodCommand) {
  if (command.kind === "empty") return { periodId: null };
  return lookupFinancePeriodId(command);
}

export function buildGenerateFinanceReportCommand(input: {
  periodId?: number;
  companyCode?: string;
  year?: number;
  month?: number;
  periodKind?: "year" | "quarter" | "month";
  type?: string;
}): DomainValidationResult<FinanceReportCommand> {
  if (!input.type) return failCommand("type 为必填（balance/income/cashflow）", 400, "type");
  if (!isFinanceReportType(input.type)) return failCommand("type 无效（balance/income/cashflow）", 400, "type");
  if (input.periodId !== undefined) {
    const period = buildFinanceIdCommand(input.periodId, "periodId");
    if (!period.ok) return period;
    return okCommand({
      periodId: period.data.id,
      periodKind: input.periodKind ?? "month",
      reportType: input.type,
    });
  }
  if (!input.companyCode || input.year === undefined || input.month === undefined) {
    return failCommand("periodId 或 companyCode+year+month 为必填", 400, "periodId");
  }
  const scope = buildFinancePeriodScopeCommand({
    companyCode: input.companyCode,
    year: input.year,
    month: input.month,
  });
  if (!scope.ok) return scope;
  return okCommand({
    companyCode: scope.data.companyCode,
    year: scope.data.year,
    month: scope.data.month!,
    periodKind: input.periodKind ?? "month",
    reportType: input.type,
  });
}

export function executeGenerateFinanceReportCommand(command: FinanceReportCommand) {
  return generateFinanceReport(command);
}

export function buildFinanceRouteIdCommand(id: unknown) {
  return buildFinanceIdCommand(id);
}

export function buildFinanceActorRouteIdCommand(id: unknown, userId: number) {
  const command = buildFinanceIdCommand(id);
  return command.ok ? okCommand({ ...command.data, userId }) : command;
}

export async function executeGetCostImportCommand(
  command: { id: number },
): Promise<ServiceResult<{ success: true; data: Awaited<ReturnType<typeof getImportById>> }>> {
  const data = await getImportById(command.id);
  if (!data) return serviceError("记录不存在", 404);
  return serviceOk({ success: true, data });
}

export async function executeDeleteCostImportCommand(command: { id: number; userId: number }) {
  const existing = await getImportById(command.id);
  if (!existing) return serviceError("记录不存在", 404);
  const result = await deleteImportById(command.id, command.userId);
  if (!result.success) return serviceError(result.error, result.status);
  return serviceOk({ success: true });
}

function reviewErrorStatus(error: unknown) {
  if (error instanceof ReviewError) {
    const statusMap: Record<string, number> = {
      INVALID_AMOUNT: 400,
      INVALID_SOURCE: 400,
      REJECTED: 409,
      NOT_FOUND: 404,
      NOT_PENDING: 409,
      ALREADY_PENDING: 409,
      INVALID_ADJUST: 400,
      INVALID_TARGET: 400,
      INVALID_ACTION: 400,
      AMOUNT_EXCEEDED: 400,
    };
    return statusMap[error.code] || 400;
  }
  return statusFrom(error);
}

export function buildListFinanceBalancesCommand(input: {
  periodId?: number;
  companyCode?: string;
  year?: number;
  month?: number;
  page: number;
  pageSize: number;
  keyword?: string;
}) {
  if (!input.periodId && (!input.companyCode || input.year === undefined || input.month === undefined)) {
    return failCommand("periodId 或 companyCode+year+month 为必填");
  }
  return okCommand(input);
}

export function executeListFinanceBalancesCommand(command: Parameters<typeof listFinanceBalances>[0]) {
  return listFinanceBalances(command);
}

export function buildFinanceBalanceCutoverReplayCommand(
  input: FinanceBalanceCutoverReplayScope,
): DomainValidationResult<FinanceBalanceCutoverReplayScope> {
  const scope = buildFinancePeriodScopeCommand(input);
  if (!scope.ok) return scope;
  if (scope.data.month === undefined) return failCommand("month 为必填", 400, "month");
  return okCommand({ ...scope.data, month: scope.data.month });
}

export function executeFinanceBalanceCutoverReplayCommand(
  command: FinanceBalanceCutoverReplayScope,
) {
  return replayFinanceBalanceCutover(command);
}

export function buildListCounterpartyBalancesCommand(input: {
  companyCode: string;
  year: number;
  month: number;
  periodKind?: string;
  category: string;
  page: number;
  pageSize: number;
  keyword?: string;
  relationScope?: string;
  objectType?: string;
}): DomainValidationResult<ListCounterpartyBalancesInput> {
  const scope = buildFinancePeriodScopeCommand(input);
  if (!scope.ok) return scope;
  if (scope.data.month === undefined) return failCommand("month 为必填", 400, "month");
  const periodKind = input.periodKind ?? "month";
  if (!isStatementPeriodKind(periodKind)) return failCommand("期间粒度无效", 400, "periodKind");
  if (!isStatementPeriodEnd({ year: scope.data.year, month: scope.data.month }, periodKind)) {
    return failCommand(periodKind === "year" ? "年度必须选择12月作为期末" : "季度必须选择季度末月份", 400, "month");
  }
  if (!isCounterpartyBalanceCategory(input.category)) {
    return failCommand("往来余额类型无效", 400, "category");
  }
  if (!Number.isInteger(input.page) || input.page <= 0) return failCommand("page 必须为正整数", 400, "page");
  if (!Number.isInteger(input.pageSize) || input.pageSize <= 0 || input.pageSize > 200) {
    return failCommand("pageSize 必须为 1..200", 400, "pageSize");
  }
  if (input.relationScope !== undefined && !isCounterpartyRelationScope(input.relationScope)) {
    return failCommand("关联范围无效", 400, "relationScope");
  }
  if (input.objectType !== undefined && !isCounterpartyObjectType(input.objectType)) {
    return failCommand("往来对象类型无效", 400, "objectType");
  }
  return okCommand({
    companyCode: scope.data.companyCode,
    year: scope.data.year,
    month: scope.data.month,
    periodKind,
    category: input.category,
    page: input.page,
    pageSize: input.pageSize,
    keyword: input.keyword?.trim() || undefined,
    relationScope: input.relationScope ?? "all",
    objectType: input.objectType ?? "all",
  });
}

export function executeListCounterpartyBalancesCommand(command: ListCounterpartyBalancesInput) {
  return listCounterpartyBalances(command);
}

export function executeRecomputeFinanceBalancesCommand(command: Parameters<typeof recomputeFinanceBalances>[0]) {
  return recomputeFinanceBalances(command);
}

function isCounterpartyBalanceCategory(
  value: string,
): value is ListCounterpartyBalancesInput["category"] {
  return value === "ar" || value === "ap" || value === "otherAr" || value === "otherAp";
}

function isStatementPeriodKind(value: string): value is StatementPeriodKind {
  return (STATEMENT_PERIOD_KINDS as readonly string[]).includes(value);
}

function isCounterpartyRelationScope(
  value: string,
): value is NonNullable<ListCounterpartyBalancesInput["relationScope"]> {
  return value === "all" || value === "related" || value === "other" || value === "unrelated" || value === "unmatched";
}

function isCounterpartyObjectType(
  value: string,
): value is NonNullable<ListCounterpartyBalancesInput["objectType"]> {
  return value === "all"
    || value === "groupCompany"
    || value === "customer"
    || value === "supplier"
    || value === "employee"
    || value === "department"
    || value === "other";
}

export function buildInitializeFinanceDefaultsCommand(input: Parameters<typeof initializeFinanceDefaults>[0], userId: number) {
  return okCommand({ input, userId });
}

export function executeInitializeFinanceDefaultsCommand(command: { input: Parameters<typeof initializeFinanceDefaults>[0]; userId: number }) {
  return initializeFinanceDefaults(command.input, command.userId);
}

export function executeBudgetAnalysisCommand(command: { year: number; companyCode?: string }) {
  return getBudgetAnalysis(command.year, command.companyCode);
}

export function executeFundFlowAnalysisCommand(command: {
  companyCodes: string[];
  year: number;
  month?: number;
}) {
  return getFundFlowAnalysis(command);
}

export function executeManagementAnalysisCommand(command: {
  companyCodes: string[];
  year: number;
  month?: number;
}) {
  return getManagementAnalysis(command);
}

export async function executeListCostImportsCommand(command: { importId?: number; page?: number; pageSize?: number }) {
  const result = await listImports(command);
  return { success: true, ...result };
}

export function executeUnsupportedCostImportCommand() {
  return serviceError("请使用导入脚本: node --import tsx scripts/import/import-finance-cost-json.mjs", 400);
}

export function buildListReclassResultsCommand(input: Parameters<typeof listReclassResults>[0]) {
  if (!input.periodId) return failCommand("periodId 为必填参数");
  return okCommand(input);
}

export function executeListReclassResultsCommand(command: Parameters<typeof listReclassResults>[0]) {
  return listReclassResults(command);
}

export async function executeAllReclassItemsCommand(command: { periodId: number }) {
  const rows = await deriveRows(command.periodId);
  const items = rows.map((r) => ({
    id: r.resultId,
    periodId: r.periodId,
    voucherItemId: r.voucherItemId,
    voucherNo: r.voucherNo,
    voucherDate: r.voucherDate,
    relatedEntity: r.relatedEntity,
    description: r.description,
    sourceAccount: r.sourceAccount,
    sourceAccountName: r.sourceAccountName,
    abnormalSide: r.abnormalSide,
    itemDebit: r.itemDebit,
    itemCredit: r.itemCredit,
    targetAccount: r.targetAccount || r.suggestedTarget || "",
    amount: r.amount,
    status: r.kind === "normal" ? "no_match" : r.kind === "pending" ? "pending" : r.kind === "approved" ? "approved" : r.kind === "adjusted" ? "adjusted" : "rejected",
    note: null,
    adjustedBy: null,
    adjustedByName: null,
    adjustedAt: null,
    kind: r.kind,
    suggestedTarget: r.suggestedTarget,
  }));
  return { items, total: items.length };
}

export function executeScheduledReclassificationCommand(command: {
  companyCode: string;
  year: number;
  month: number;
}) {
  return computeReclassification(command.companyCode, command.year, command.month);
}

export function buildBuildReclassResultsCommand(input: { periodId: number; dryRun?: boolean }) {
  return okCommand({ periodId: input.periodId, dryRun: input.dryRun !== false });
}

export function executeBuildReclassResultsCommand(command: { periodId: number; dryRun: boolean }) {
  return buildReclassResults(command.periodId, { dryRun: command.dryRun });
}

export type ReclassResultPatchCommand =
  | { kind: "manual"; body: z.infer<typeof manualReclassResultSchema>; userId: number }
  | { kind: "review"; id: number; body: z.infer<typeof reviewReclassPayloadSchema>; userId: number };

export function buildReclassResultPatchCommand(input: {
  id: number;
  body: Record<string, unknown>;
  userId: number;
}): DomainValidationResult<ReclassResultPatchCommand> {
  if (input.id === 0) {
    const parsed = manualReclassResultSchema.safeParse(input.body);
    if (!parsed.success) return failCommand("缺少 periodId / voucherItemId / targetAccount");
    return okCommand({ kind: "manual", body: parsed.data, userId: input.userId });
  }
  if (!input.id) return failCommand("无效的 ID");
  const parsed = reviewReclassPayloadSchema.safeParse(input.body);
  if (!parsed.success) {
    if (input.body.action === "adjust") return failCommand("调整操作需提供有效的 targetAccount 和 amount > 0");
    return failCommand("action 必须为 approve / reject / adjust / revert / mark_pending");
  }
  return okCommand({ kind: "review", id: input.id, body: parsed.data, userId: input.userId });
}

export async function executeReclassResultPatchCommand(command: ReclassResultPatchCommand) {
  try {
    if (command.kind === "manual") {
      const item = await createManualReclassResult({
        periodId: command.body.periodId,
        voucherItemId: command.body.voucherItemId,
        sourceAccount: command.body.sourceAccount,
        targetAccount: command.body.targetAccount,
        amount: command.body.amount,
        userId: command.userId,
      });
      return { item };
    }
    const item = await reviewReclassResult({
      id: command.id,
      payload: command.body,
      userId: command.userId,
    });
    return { item };
  } catch (error) {
    if (error instanceof ReviewError) {
      return serviceResponse({
        ok: false,
        error: error.message,
        status: reviewErrorStatus(error),
        code: error.code,
      } as ServiceResult<never> & { code: string });
    }
    throw error;
  }
}

export function buildScanReclassRulesCommand(policyVersionId?: number) {
  return okCommand({ policyVersionId });
}

export function executeScanReclassRulesCommand(command: { policyVersionId?: number }) {
  return scanCandidates(command.policyVersionId);
}

export function buildSaveReclassRuleChangeSetRouteCommand(input: SaveReclassRuleChangeSetInput) {
  return buildSaveReclassRuleChangeSetCommand(input);
}

export function executeSaveReclassRuleChangeSetRouteCommand(command: { input: SaveReclassRuleChangeSetInput }) {
  return saveReclassRuleChangeSet(command.input);
}

export function buildSaveBalanceReclassAdjustmentChangeSetRouteCommand(input: SaveBalanceReclassAdjustmentChangeSetInput) {
  return buildSaveBalanceReclassAdjustmentChangeSetCommand(input);
}

export function executeSaveBalanceReclassAdjustmentChangeSetRouteCommand(command: { input: SaveBalanceReclassAdjustmentChangeSetInput }) {
  return saveBalanceReclassAdjustmentChangeSet(command.input);
}

export async function executeListVouchersCommand(command: Parameters<typeof listVouchers>[0]) {
  return await listVouchers(command);
}

export function buildListVouchersCommand(
  input: Parameters<typeof listVouchers>[0],
): DomainValidationResult<Parameters<typeof listVouchers>[0]> {
  const periodKind = input.periodKind ?? "month";
  const issue = voucherPeriodValidationIssue(input);
  if (issue) return failCommand(issue.error, 400, issue.field);
  return okCommand({ ...input, periodKind });
}

export function buildCreateVoucherCommand(body: Parameters<typeof createVoucher>[0], userId: number) {
  return okCommand({ body, userId });
}

function financeLegacyErrorResult<T extends object>(result: T) {
  if ("error" in result && typeof result.error === "string") {
    return serviceError(result.error, "status" in result && typeof result.status === "number" ? result.status : 400);
  }
  return result;
}

export async function executeCreateVoucherCommand(command: { body: Parameters<typeof createVoucher>[0]; userId: number }) {
  return financeLegacyErrorResult(await createVoucher(command.body, command.userId));
}

export function buildUpdateVoucherCommand(id: number, body: Parameters<typeof updateVoucher>[1], userId: number) {
  return okCommand({ id, body, userId });
}

export async function executeUpdateVoucherCommand(command: { id: number; body: Parameters<typeof updateVoucher>[1]; userId: number }) {
  return financeLegacyErrorResult(await updateVoucher(command.id, command.body, command.userId));
}

export async function executeDeleteVoucherCommand(command: { id: number; userId: number }) {
  return financeLegacyErrorResult(await deleteVoucher(command.id, command.userId));
}

export function executeReportDetailCommand(command: Parameters<typeof getReportDetail>[0]) {
  return getReportDetail(command);
}
