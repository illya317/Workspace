import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { finiteNumber, positiveId, requiredText } from "../domain/shared-validation";

export interface FinanceRowsCommand<T> {
  id: number;
  rows: T[];
}

export function buildFinanceDataImportCommand<T extends {
  profile: string;
  sourceFile: string;
  recordCount: number;
  warningCount: number;
  errorCount: number;
}>(data: T): DomainValidationResult<{ data: T }> {
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
