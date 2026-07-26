import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { buildFinancePeriodScopeCommand, requiredText } from "./finance-validation";

export interface FinanceReadableBatchWriteInput {
  companyCode: unknown;
  companyName: unknown;
  year: unknown;
  sourceSystem: unknown;
  sourceLedger: unknown;
  sourceDatabase: unknown;
  mappingMode: unknown;
  mappingStartYear: unknown;
  mappingEndYear?: unknown;
  continuationOf?: unknown;
}

export interface FinanceReadableBatchWriteCommand {
  companyCode: string;
  companyName: string;
  year: number;
  sourceSystem: "T6" | "TPLUS";
  sourceLedger: string;
  sourceDatabase: string;
  mappingMode: "recurring" | "historical";
  mappingStartYear: number;
  mappingEndYear?: number;
  continuationOf?: string;
}

export function buildFinanceReadableBatchWriteCommand(
  input: FinanceReadableBatchWriteInput,
): DomainValidationResult<FinanceReadableBatchWriteCommand> {
  const scope = buildFinancePeriodScopeCommand({
    companyCode: input.companyCode,
    year: input.year,
  });
  if (!scope.ok) return scope;

  const companyName = requiredText(input.companyName, "companyName");
  if (!companyName.ok) return companyName;
  if (input.sourceSystem !== "T6" && input.sourceSystem !== "TPLUS") {
    return failCommand("sourceSystem must be T6 or TPLUS", 400, "sourceSystem");
  }
  const sourceLedger = requiredText(input.sourceLedger, "sourceLedger");
  if (!sourceLedger.ok) return sourceLedger;
  const sourceDatabase = requiredText(input.sourceDatabase, "sourceDatabase");
  if (!sourceDatabase.ok) return sourceDatabase;
  const mappingStartYear = Number(input.mappingStartYear);
  if (!Number.isInteger(mappingStartYear) || mappingStartYear < 1900 || mappingStartYear > scope.data.year) {
    return failCommand("mappingStartYear must be a valid year no later than the import year", 400, "mappingStartYear");
  }
  const mappingEndYear = input.mappingEndYear == null ? undefined : Number(input.mappingEndYear);
  if (mappingEndYear !== undefined && (!Number.isInteger(mappingEndYear) || mappingEndYear < scope.data.year || mappingEndYear < mappingStartYear)) {
    return failCommand("mappingEndYear must cover the import year", 400, "mappingEndYear");
  }
  const continuationOf = typeof input.continuationOf === "string" ? input.continuationOf.trim() : "";
  if (input.sourceSystem === "T6" && input.mappingMode !== "recurring") {
    return failCommand("T6 source must use recurring mapping", 400, "mappingMode");
  }
  if (input.sourceSystem === "T6" && mappingEndYear !== undefined) {
    return failCommand("T6 recurring mapping must stay open-ended", 400, "mappingEndYear");
  }
  if (input.sourceSystem === "TPLUS" && input.mappingMode !== "historical") {
    return failCommand("TPlus source must use historical mapping", 400, "mappingMode");
  }
  if (input.sourceSystem === "TPLUS" && (mappingEndYear === undefined || !/^T6\/[A-Za-z0-9_-]+$/.test(continuationOf))) {
    return failCommand("TPlus historical mapping requires an end year and successor T6 ledger", 400, "continuationOf");
  }
  const mappingMode = input.mappingMode as "recurring" | "historical";

  return okCommand({
    ...scope.data,
    companyName: companyName.data,
    sourceSystem: input.sourceSystem,
    sourceLedger: sourceLedger.data,
    sourceDatabase: sourceDatabase.data,
    mappingMode,
    mappingStartYear,
    ...(mappingEndYear === undefined ? {} : { mappingEndYear }),
    ...(continuationOf ? { continuationOf } : {}),
  });
}

export function assertFinanceReadableBatchWriteScope(
  input: FinanceReadableBatchWriteInput,
): FinanceReadableBatchWriteCommand {
  const command = buildFinanceReadableBatchWriteCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  return command.data;
}
