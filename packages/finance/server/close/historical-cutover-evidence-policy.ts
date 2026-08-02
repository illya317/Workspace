import type { FinanceCloseProviderInspection } from "../../types/close";
import { financeCloseInspectionFingerprint } from "./inspection-identity";

export type HistoricalCutoverEvidencePolicy = {
  enabled: boolean;
  periodRef: string;
  voucherRefs: string[];
};

const HISTORICAL_OUTPUT_BLOCKERS = new Map<string, ReadonlySet<string>>([
  ["finance.statements.standalone", new Set(["provider_unavailable", "provider_not_registered"])],
  ["finance.statements.cashflow-equity", new Set(["provider_unavailable", "provider_not_registered"])],
  ["finance.statements.group-adjustments", new Set(["in_progress_group_entries", "consolidation_not_locked"])],
  ["finance.statements.consolidated", new Set(["in_progress_group_entries", "consolidation_not_locked"])],
]);

function canUseHistoricalLedgerEvidence(key: string, inspection: FinanceCloseProviderInspection) {
  if (inspection.status === "pending" && inspection.blockers.length === 0) return true;
  const allowed = HISTORICAL_OUTPUT_BLOCKERS.get(key);
  return Boolean(allowed && inspection.blockers.length > 0 && inspection.blockers.every((blocker) => allowed.has(blocker.code)));
}

export function applyHistoricalCutoverEvidencePolicy(
  inspections: ReadonlyMap<string, FinanceCloseProviderInspection>,
  policy: HistoricalCutoverEvidencePolicy,
): ReadonlyMap<string, FinanceCloseProviderInspection> {
  if (!policy.enabled) return inspections;
  const governed = new Map<string, FinanceCloseProviderInspection>();
  for (const [key, inspection] of inspections) {
    if (!canUseHistoricalLedgerEvidence(key, inspection)) {
      governed.set(key, inspection);
      continue;
    }
    const evidenceRefs = [...new Set([...inspection.evidenceRefs, policy.periodRef])].sort();
    const voucherRefs = [...new Set([...inspection.voucherRefs, ...policy.voucherRefs])].sort();
    const payload = {
      provider: inspection.payload,
      historicalCutoverEvidencePolicy: {
        version: "june-2026-source-closed-ledger-v2",
        decision: "ready",
        basis: "source-closed period balance table and posted vouchers",
        supersededStatus: inspection.status,
        supersededBlockers: inspection.blockers,
      },
    };
    const ready: FinanceCloseProviderInspection = {
      ...inspection,
      status: "ready",
      contributorVersion: `${inspection.contributorVersion}+june-cutover-ledger-v2`,
      evidenceRefs,
      voucherRefs,
      payload,
    };
    governed.set(key, {
      ...ready,
      inputFingerprint: financeCloseInspectionFingerprint(ready),
    });
  }
  return governed;
}
