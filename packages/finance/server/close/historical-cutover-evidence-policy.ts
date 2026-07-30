import type { FinanceCloseProviderInspection } from "../../types/close";
import { financeCloseInspectionFingerprint } from "./inspection-identity";

export type HistoricalCutoverEvidencePolicy = {
  enabled: boolean;
  periodRef: string;
  voucherRefs: string[];
};

export function applyHistoricalCutoverEvidencePolicy(
  inspections: ReadonlyMap<string, FinanceCloseProviderInspection>,
  policy: HistoricalCutoverEvidencePolicy,
): ReadonlyMap<string, FinanceCloseProviderInspection> {
  if (!policy.enabled) return inspections;
  const governed = new Map<string, FinanceCloseProviderInspection>();
  for (const [key, inspection] of inspections) {
    if (inspection.status !== "pending" || inspection.blockers.length > 0) {
      governed.set(key, inspection);
      continue;
    }
    const evidenceRefs = [...new Set([...inspection.evidenceRefs, policy.periodRef])].sort();
    const voucherRefs = [...new Set([...inspection.voucherRefs, ...policy.voucherRefs])].sort();
    const payload = {
      provider: inspection.payload,
      historicalCutoverEvidencePolicy: {
        version: "june-2026-source-closed-ledger-v1",
        decision: "ready",
        basis: "source-closed period balance table and posted vouchers",
      },
    };
    const ready: FinanceCloseProviderInspection = {
      ...inspection,
      status: "ready",
      contributorVersion: `${inspection.contributorVersion}+june-cutover-ledger-v1`,
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
