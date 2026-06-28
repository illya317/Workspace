import { serviceError, serviceOk, serviceResponse, type ServiceResult } from "@workspace/platform/server/api";
import { z } from "zod";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { deleteImportById, getImportById, listImports } from "./cost";
import { getBudgetAnalysis } from "./analysis/budget-analysis";
import { deriveRows } from "./ledger/reclass-results/derived";
import { computeReclassification } from "./schedules/reclassify";
import { getReportDetail } from "./statements/report-detail";
import { buildFinanceIdCommand, buildFinancePeriodScopeCommand } from "./domain/finance-validation";
import { listFinanceBalances, recomputeFinanceBalances } from "./ledger/balance-api";
import { reconcileBalanceSheet } from "./ledger/balance-reconcile";
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
import { deleteReclassRule, scanCandidates, upsertReclassRule } from "./ledger/reclass-rules";
import { ensureReclassRulesForYear } from "./ledger/reclass-rules/ensure";
import { createVoucher, deleteVoucher, listVouchers, updateVoucher } from "./ledger/voucher-service";
import { generateFinanceReport, type GenerateFinanceReportInput } from "./statements/report-generator";
import {
  generateReview,
  getReview,
  updateReviewLines,
  confirmReview,
} from "./statements/reviews/service";
import { getStatementConfigView, saveStatementConfigLines } from "./statements/statement-config-view";
import {
  deleteStatementMapping,
  listStatementMappings,
  saveStatementMapping,
  StatementMappingServiceError,
} from "./statements/mapping/statement-mappings";
import { getOrCreateDraft, saveWorkpaper } from "./statements/workpapers/service";
import type { WorkpaperOutput } from "./statements/workpapers/types";

export {
  buildFinanceImportConfirmCommand,
  buildFinanceImportPreviewCommand,
  executeFinanceImportConfirmCommand,
  executeFinanceImportPreviewCommand,
} from "./import/route-commands";

type FinanceReportType = GenerateFinanceReportInput["reportType"];

export type LookupFinancePeriodCommand =
  | { kind: "empty" }
  | { kind: "lookup"; companyCode: string; year: number; month: number };

export type FinanceReportCommand = GenerateFinanceReportInput;

export interface FinanceReviewConfirmCommand {
  reviewId: number;
  userId: number;
}

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
  type?: string;
}): DomainValidationResult<FinanceReportCommand> {
  if (!input.type) return failCommand("type 为必填（balance/income/cashflow）", 400, "type");
  if (!isFinanceReportType(input.type)) return failCommand("type 无效（balance/income/cashflow）", 400, "type");
  if (input.periodId !== undefined) {
    const period = buildFinanceIdCommand(input.periodId, "periodId");
    if (!period.ok) return period;
    return okCommand({ periodId: period.data.id, reportType: input.type });
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
    reportType: input.type,
  });
}

export function executeGenerateFinanceReportCommand(command: FinanceReportCommand) {
  return generateFinanceReport(command);
}

export function buildFinanceRouteIdCommand(id: unknown) {
  return buildFinanceIdCommand(id);
}

export async function executeGetCostImportCommand(
  command: { id: number },
): Promise<ServiceResult<{ success: true; data: Awaited<ReturnType<typeof getImportById>> }>> {
  const data = await getImportById(command.id);
  if (!data) return serviceError("记录不存在", 404);
  return serviceOk({ success: true, data });
}

export async function executeDeleteCostImportCommand(command: { id: number }) {
  const existing = await getImportById(command.id);
  if (!existing) return serviceError("记录不存在", 404);
  await deleteImportById(command.id);
  return serviceOk({ success: true });
}

export function buildFinanceReviewConfirmCommand(
  reviewId: unknown,
  userId: unknown,
): DomainValidationResult<FinanceReviewConfirmCommand> {
  const review = buildFinanceIdCommand(reviewId, "reviewId");
  if (!review.ok) return review;
  const user = buildFinanceIdCommand(userId, "userId");
  if (!user.ok) return user;
  return okCommand({ reviewId: review.data.id, userId: user.data.id });
}

export async function executeFinanceReviewConfirmCommand(command: FinanceReviewConfirmCommand) {
  try {
    const review = await confirmReview(command.reviewId, command.userId);
    return serviceOk({ review });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "确认校对失败", statusFrom(error));
  }
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

export function executeRecomputeFinanceBalancesCommand(command: Parameters<typeof recomputeFinanceBalances>[0]) {
  return recomputeFinanceBalances(command);
}

export function buildReconcileBalanceSheetCommand(input: { file?: FormDataEntryValue; companyCode?: FormDataEntryValue }) {
  if (!(input.file instanceof File)) return failCommand("请上传余额表文件");
  if (typeof input.companyCode !== "string" || !input.companyCode) return failCommand("请选择公司");
  return okCommand({ file: input.file, companyCode: input.companyCode });
}

export async function executeReconcileBalanceSheetCommand(command: { file: File; companyCode: string }) {
  try {
    const buffer = Buffer.from(await command.file.arrayBuffer());
    const fileExt = command.file.name.slice(command.file.name.lastIndexOf(".")).toLowerCase();
    const result = await reconcileBalanceSheet(buffer, command.companyCode, fileExt);
    return { success: true, result };
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "核对失败", 500);
  }
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

export async function executeListCostImportsCommand(command: { page?: number; pageSize?: number }) {
  const result = await listImports(command);
  return { success: true, ...result };
}

export function executeUnsupportedCostImportCommand() {
  return serviceError("请使用导入脚本: node scripts/import-finance-cost-json.mjs", 400);
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

export async function buildScanReclassRulesCommand(input: { companyCode: string; year: number }) {
  await ensureReclassRulesForYear(input.companyCode, input.year);
  return okCommand(input);
}

export function executeScanReclassRulesCommand(command: Parameters<typeof scanCandidates>[0]) {
  return scanCandidates(command);
}

export function buildUpsertReclassRuleRouteCommand(input: Parameters<typeof upsertReclassRule>[0]) {
  return okCommand(input);
}

export function executeUpsertReclassRuleRouteCommand(command: Parameters<typeof upsertReclassRule>[0]) {
  return upsertReclassRule(command);
}

export function executeDeleteReclassRuleRouteCommand(command: { id: number }) {
  return deleteReclassRule(command.id);
}

export function executeListVouchersCommand(command: Parameters<typeof listVouchers>[0]) {
  return listVouchers(command);
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

export async function executeDeleteVoucherCommand(command: { id: number }) {
  return financeLegacyErrorResult(await deleteVoucher(command.id));
}

export function buildStatementConfigViewCommand(input: { companyCode?: string; year?: number; type?: "balance" }) {
  if (!input.companyCode || input.year === undefined) return failCommand("companyCode, year 为必填");
  return okCommand({ companyCode: input.companyCode, year: input.year, type: input.type ?? "balance" });
}

export function executeStatementConfigViewCommand(command: { companyCode: string; year: number; type: "balance" }) {
  return getStatementConfigView(command.companyCode, command.year, command.type);
}

export function buildSaveStatementConfigCommand(input: Parameters<typeof saveStatementConfigLines>[0]) {
  if (!Array.isArray(input.lines)) return failCommand("lines 数组为必填");
  return okCommand(input);
}

export function executeSaveStatementConfigCommand(command: Parameters<typeof saveStatementConfigLines>[0]) {
  return saveStatementConfigLines(command);
}

function statementMappingError(error: unknown) {
  if (error instanceof StatementMappingServiceError) {
    return serviceError(error.message, error.status);
  }
  throw error;
}

export async function executeListStatementMappingsCommand(command: Parameters<typeof listStatementMappings>[0]) {
  try {
    return await listStatementMappings(command);
  } catch (error) {
    return statementMappingError(error);
  }
}

export async function executeSaveStatementMappingCommand(command: Parameters<typeof saveStatementMapping>[0]) {
  try {
    return await saveStatementMapping(command);
  } catch (error) {
    return statementMappingError(error);
  }
}

export async function executeDeleteStatementMappingCommand(command: Parameters<typeof deleteStatementMapping>[0]) {
  try {
    return await deleteStatementMapping(command);
  } catch (error) {
    return statementMappingError(error);
  }
}

export function executeGetReviewCommand(command: Parameters<typeof getReview>[0]) {
  return getReview(command).then((review) => ({ review }));
}

export function buildGenerateReviewCommand(workpaperId: number, userId: number) {
  return okCommand({ workpaperId, userId });
}

export async function executeGenerateReviewCommand(command: { workpaperId: number; userId: number }) {
  try {
    const { review, created } = await generateReview(command.workpaperId, command.userId);
    void created;
    return serviceOk({ review });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "生成校对失败", statusFrom(error));
  }
}

export function buildUpdateReviewCommand(input: {
  id: number;
  lines: Parameters<typeof updateReviewLines>[1];
  note?: string | null;
  userId: number;
}) {
  return okCommand(input);
}

export async function executeUpdateReviewCommand(command: {
  id: number;
  lines: Parameters<typeof updateReviewLines>[1];
  note?: string | null;
  userId: number;
}) {
  try {
    const review = await updateReviewLines(command.id, command.lines, command.note, command.userId);
    return serviceOk({ review });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "更新校对失败", statusFrom(error));
  }
}

export function buildWorkpaperQueryCommand(input: Parameters<typeof getOrCreateDraft>[0]) {
  return okCommand(input);
}

export function executeWorkpaperQueryCommand(command: Parameters<typeof getOrCreateDraft>[0]): Promise<WorkpaperOutput> {
  return getOrCreateDraft(command);
}

export function executeReportDetailCommand(command: Parameters<typeof getReportDetail>[0]) {
  return getReportDetail(command);
}

export function buildSaveWorkpaperCommand(input: Parameters<typeof saveWorkpaper>[0], userId: number) {
  return okCommand({ input, userId });
}

export async function executeSaveWorkpaperCommand(command: { input: Parameters<typeof saveWorkpaper>[0]; userId: number }) {
  try {
    return await saveWorkpaper(command.input, command.userId);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "保存失败", 400);
  }
}
