import type { StatementPeriodKind } from "./statement-period";

export const FINANCE_CONSOLIDATION_SCOPE_SELECTION_API_PATH =
  "/api/modules/finance/statements/consolidation/scope-selections";

export interface SaveFinanceConsolidationScopeSelectionInput {
  parentCompanyId: number;
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
  companyId: number;
  relationId: number;
  expectedRelationVersion: number;
  included: boolean;
}
