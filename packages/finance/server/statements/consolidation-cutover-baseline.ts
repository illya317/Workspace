import type { Prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import { certifyCutoverAmountExplanations } from "./consolidation-cutover-amount-explanations";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function selectedConsolidationCutoverBaseline(companyCode: string, year: number, month: number) {
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [...(getTenantProfile().financeConsolidationPolicies?.cutoverBaselines ?? [])]
    .filter((item) => item.foreignCompanyCode === companyCode
      && item.baselineDate < periodEnd
      && item.presentationCurrencyCode.toUpperCase() === "CNY")
    .sort((left, right) => right.baselineDate.localeCompare(left.baselineDate))
    .at(0) ?? null;
}

export async function consolidationCutoverBaselineFact(companyCode: string, year: number, month: number) {
  const baseline = selectedConsolidationCutoverBaseline(companyCode, year, month);
  if (!baseline) return null;
  return {
    ...baseline,
    amountExplanations: await certifyCutoverAmountExplanations(
      baseline.amountExplanationQueries ?? [],
      baseline.baselineDate,
    ),
  };
}

export function frozenCutoverBaselineKey(existing?: { reportPayload: Prisma.InputJsonValue }) {
  const envelope = record(existing?.reportPayload);
  const translationFacts = record(envelope?.translationFacts);
  const baseline = record(translationFacts?.consolidationCutoverBaseline);
  return typeof baseline?.key === "string" ? baseline.key : null;
}
