import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { buildFinanceIdCommand, buildFinancePeriodScopeCommand } from "../domain/shared-validation";
import { generateFinanceReport, type GenerateFinanceReportInput } from "./report-generator";
import { getReportDetail } from "./report-detail";

type FinanceReportType = GenerateFinanceReportInput["reportType"];
export type FinanceReportCommand = GenerateFinanceReportInput;

function isFinanceReportType(type: unknown): type is FinanceReportType {
  return type === "balance" || type === "income" || type === "cashflow";
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

export function executeReportDetailCommand(command: Parameters<typeof getReportDetail>[0]) {
  return getReportDetail(command);
}
