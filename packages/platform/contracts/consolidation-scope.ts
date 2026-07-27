/**
 * Cross-domain command contract for callers that present consolidation scope
 * while Capital Securities remains the ledger and API owner.
 */
export const CONSOLIDATION_SCOPE_UPDATE_API_PATH =
  "/api/modules/capitalSecurities/governance/ownership-interests/consolidation";

export interface ConsolidationScopeUpdateRequest {
  relationId: number;
  expectedVersion: number;
  included: boolean;
  effectiveDate: string;
}
