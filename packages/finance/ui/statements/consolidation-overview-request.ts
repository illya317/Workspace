import type { ConsolidationOverview } from "@workspace/finance/types";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";

export interface ConsolidationOverviewSelection {
  parentCompanyId: number | null;
  year: number | null;
  month: number | null;
  periodKind: StatementPeriodKind;
  batchId: number | null;
}

export function consolidationOverviewMatchesSelection(
  overview: ConsolidationOverview,
  selection: ConsolidationOverviewSelection,
) {
  if (overview.scope.periodKind !== selection.periodKind) return false;
  if (selection.parentCompanyId !== null && overview.scope.parentCompanyId !== selection.parentCompanyId) return false;
  if (selection.year !== null && overview.scope.year !== selection.year) return false;
  if (selection.month !== null && overview.scope.month !== selection.month) return false;
  if (selection.batchId !== null && overview.batch?.id !== selection.batchId) return false;
  return true;
}
