import "server-only";

import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

import { loadConsolidatedReportOutput } from "./statements/consolidated-output-service";
import { loadConsolidationOverview } from "./statements/consolidation-overview";
import { getReportDetail } from "./statements/report-detail";
import type {
  FinanceConsolidatedEntityAmountRow,
  FinanceConsolidatedLineRow,
  FinanceConsolidationEntityRow,
} from "./workspace-analysis-child-sources";

const SOURCE_KEYS = new Set([
  "finance.statements.account-details",
  "finance.statements.reclass-adjustments",
  "finance.statements.consolidation-entities",
  "finance.statements.consolidated-lines",
  "finance.statements.consolidated-entity-amounts",
]);
const MAX_ROWS = 4_000;

export function isFinanceStatementCompositeWorkspaceAnalysisSource(sourceKey: string) {
  return SOURCE_KEYS.has(sourceKey);
}

export async function loadFinanceStatementCompositeWorkspaceAnalysisSourcePage(input: {
  readonly sourceKey: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly page: number;
  readonly pageSize: number;
}) {
  const { sourceKey, parameters, page, pageSize } = input;
  if (sourceKey === "finance.statements.account-details" || sourceKey === "finance.statements.reclass-adjustments") {
    const result = await getReportDetail({
      companyCode: requiredText(parameters.companyCode, "companyCode", sourceKey),
      year: requiredInteger(parameters.year, "year", sourceKey),
      month: requiredInteger(parameters.month, "month", sourceKey),
      periodKind: statementPeriodKind(parameters.periodKind, sourceKey),
      codes: requiredText(parameters.codes, "codes", sourceKey).split(/[,+-]/).map((code) => code.trim()).filter(Boolean),
    });
    return boundedPage(sourceKey, sourceKey === "finance.statements.account-details" ? result.details : result.reclassAdjustments ?? [], page, pageSize);
  }
  if (sourceKey === "finance.statements.consolidation-entities") {
    const result = await loadConsolidationOverview({
      parentCompanyId: integer(parameters.parentCompanyId),
      year: integer(parameters.year),
      month: integer(parameters.month),
      periodKind: statementPeriodKind(parameters.periodKind, sourceKey),
      batchId: integer(parameters.batchId),
    });
    if ("ok" in result) {
      if (!result.ok) throw unavailable(sourceKey, result.error);
      throw unavailable(sourceKey, "合并范围返回了无效的空服务结果");
    }
    const rows: FinanceConsolidationEntityRow[] = result.entities.map((entity) => ({
      entitySnapshotId: entity.entitySnapshotId, companyId: entity.companyId, relationId: entity.relationId,
      code: entity.code, name: entity.name, fullName: entity.fullName, role: entity.role,
      parentCode: entity.parentCode, parentName: entity.parentName, shareRatio: entity.shareRatio, status: entity.status,
      balanceSheetKind: entity.balanceSheet.kind, balanceSheetStatus: entity.balanceSheet.status, balanceSheetLineCount: entity.balanceSheet.lineCount,
      incomeStatementKind: entity.incomeStatement.kind, incomeStatementStatus: entity.incomeStatement.status, incomeStatementLineCount: entity.incomeStatement.lineCount,
      cashFlowKind: entity.cashFlow.kind, cashFlowStatus: entity.cashFlow.status, cashFlowLineCount: entity.cashFlow.lineCount,
    }));
    return boundedPage(sourceKey, rows, page, pageSize);
  }
  const result = await loadConsolidatedReportOutput(requiredInteger(parameters.batchId, "batchId", sourceKey));
  if (!result.ok) throw unavailable(sourceKey, result.error);
  if (sourceKey === "finance.statements.consolidated-lines") {
    const rows: FinanceConsolidatedLineRow[] = result.data.report.statements.flatMap((statement) => statement.lines.map(({ entityAmounts: _entityAmounts, translationTrace: _translationTrace, ...line }) => ({
      reportType: statement.reportType, reportLabel: statement.label, ...line,
    })));
    return boundedPage(sourceKey, rows, page, pageSize);
  }
  const rows: FinanceConsolidatedEntityAmountRow[] = result.data.report.statements.flatMap((statement) => statement.lines.flatMap((line) => (line.entityAmounts ?? []).map(({ translationTrace: _translationTrace, ...amount }) => ({
    reportType: statement.reportType, lineCode: line.lineCode, ...amount,
  }))));
  return boundedPage(sourceKey, rows, page, pageSize);
}

function boundedPage(sourceKey: string, rows: readonly unknown[], page: number, pageSize: number) {
  if (rows.length > MAX_ROWS) throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", `规范化行数 ${rows.length} 超过上限 ${MAX_ROWS}`, sourceKey);
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

function text(value: string | number | boolean | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function requiredText(value: string | number | boolean | undefined, key: string, sourceKey: string) {
  const parsed = text(value);
  if (parsed === undefined) throw unavailable(sourceKey, `${key} 为必填参数`);
  return parsed;
}

function requiredInteger(value: string | number | boolean | undefined, key: string, sourceKey: string) {
  const parsed = integer(value);
  if (parsed === undefined) throw unavailable(sourceKey, `${key} 为必填参数`);
  return parsed;
}

function statementPeriodKind(value: string | number | boolean | undefined, sourceKey: string) {
  if (value === undefined) return undefined;
  if (value === "year" || value === "quarter" || value === "month") return value;
  throw unavailable(sourceKey, "periodKind 仅支持 year、quarter 或 month");
}

function unavailable(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_unavailable", message, sourceKey);
}
