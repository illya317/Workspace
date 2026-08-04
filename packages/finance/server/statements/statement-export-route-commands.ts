import { serviceError } from "@workspace/platform/service-result";
import type { DomainValidationResult } from "@workspace/platform/server/domain-validation";

import {
  buildFinanceIdCommand,
  buildFinancePeriodScopeCommand,
} from "../domain/shared-validation";
import {
  loadConsolidatedStatementPageData,
  loadStandaloneStatementPageData,
  StatementPageDataError,
} from "./statement-page-data";
import { loadConsolidatedReportOutput } from "./consolidated-output-service";
import {
  buildConsolidationWorkpaperWorkbook,
  consolidationWorkpaperFilename,
} from "./consolidation-workpaper-workbook";
import { buildStatementWorkbook, statementWorkbookFilename } from "./statement-workbook";
import {
  buildFxTranslationWorkpaperWorkbook,
  fxTranslationWorkpaperFilename,
} from "./fx-translation-workpaper-workbook";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface StandaloneStatementExportCommand {
  companyCode: string;
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
}

export interface ConsolidatedStatementExportCommand {
  batchId: number;
  artifact: "report" | "workpaper" | "fxWorkpaper";
}

export function buildStandaloneStatementExportCommand(input: {
  companyCode: unknown;
  year: unknown;
  month: unknown;
  periodKind?: StatementPeriodKind;
}): DomainValidationResult<StandaloneStatementExportCommand> {
  const scope = buildFinancePeriodScopeCommand(input);
  if (!scope.ok) return scope;
  return {
    ok: true,
    data: {
      companyCode: scope.data.companyCode,
      year: scope.data.year,
      month: scope.data.month!,
      periodKind: input.periodKind ?? "month",
    },
  };
}

export function buildConsolidatedStatementExportCommand(
  batchId: unknown,
  artifact: "report" | "workpaper" | "fxWorkpaper" = "report",
): DomainValidationResult<ConsolidatedStatementExportCommand> {
  const command = buildFinanceIdCommand(batchId, "batchId");
  return command.ok ? { ok: true, data: { batchId: command.data.id, artifact } } : command;
}

function workbookResponse(body: Buffer, filename: string) {
  return new Response(body as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

async function statementExportResponse(loader: () => Promise<Awaited<ReturnType<typeof loadStandaloneStatementPageData>>>) {
  try {
    const data = await loader();
    return workbookResponse(buildStatementWorkbook(data), statementWorkbookFilename(data));
  } catch (cause) {
    if (cause instanceof StatementPageDataError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}

export function executeStandaloneStatementExportCommand(command: StandaloneStatementExportCommand) {
  return statementExportResponse(() => loadStandaloneStatementPageData(command));
}

export function executeConsolidatedStatementExportCommand(command: ConsolidatedStatementExportCommand) {
  if (command.artifact === "fxWorkpaper") {
    return loadConsolidatedReportOutput(command.batchId).then((result) => (
      result.ok
        ? workbookResponse(
            buildFxTranslationWorkpaperWorkbook(result.data.report),
            fxTranslationWorkpaperFilename(result.data.report),
          )
        : serviceError(result.error, result.status)
    ));
  }
  if (command.artifact === "workpaper") {
    return loadConsolidatedReportOutput(command.batchId).then((result) => (
      result.ok
        ? workbookResponse(
            buildConsolidationWorkpaperWorkbook(result.data.report),
            consolidationWorkpaperFilename(result.data.report),
          )
        : serviceError(result.error, result.status)
    ));
  }
  return statementExportResponse(() => loadConsolidatedStatementPageData(command.batchId));
}
