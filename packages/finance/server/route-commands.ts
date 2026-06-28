import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { deleteImportById, getImportById } from "./cost";
import { buildFinanceIdCommand, buildFinancePeriodScopeCommand } from "./domain/finance-validation";
import { lookupFinancePeriodId } from "./ledger/periods";
import { generateFinanceReport, type GenerateFinanceReportInput } from "./statements/report-generator";
import { confirmReview } from "./statements/reviews/service";

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
