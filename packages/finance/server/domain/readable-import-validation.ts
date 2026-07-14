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
}

export interface FinanceReadableBatchWriteCommand {
  companyCode: string;
  companyName: string;
  year: number;
  sourceSystem: "T6" | "TPLUS";
  sourceLedger: string;
  sourceDatabase: string;
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

  return okCommand({
    ...scope.data,
    companyName: companyName.data,
    sourceSystem: input.sourceSystem,
    sourceLedger: sourceLedger.data,
    sourceDatabase: sourceDatabase.data,
  });
}

export function assertFinanceReadableBatchWriteScope(
  input: FinanceReadableBatchWriteInput,
): FinanceReadableBatchWriteCommand {
  const command = buildFinanceReadableBatchWriteCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  return command.data;
}
