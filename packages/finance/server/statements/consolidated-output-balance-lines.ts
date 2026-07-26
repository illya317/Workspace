import type { ConsolidatedOutputLine } from "@workspace/finance/types";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function combinedEntityAmounts(
  current: ConsolidatedOutputLine | undefined,
  nonCurrent: ConsolidatedOutputLine | undefined,
) {
  const byEntity = new Map<number, NonNullable<ConsolidatedOutputLine["entityAmounts"]>[number]>();
  for (const item of [...(current?.entityAmounts ?? []), ...(nonCurrent?.entityAmounts ?? [])]) {
    const existing = byEntity.get(item.entitySnapshotId);
    byEntity.set(item.entitySnapshotId, existing ? {
      ...existing,
      amount: money(existing.amount + item.amount),
      previousAmount: money(existing.previousAmount + item.previousAmount),
    } : { ...item });
  }
  return [...byEntity.values()];
}

export function ensureLiabilityGrandTotal(
  orderedCodes: string[],
  outputByCode: Map<string, ConsolidatedOutputLine>,
) {
  if (outputByCode.has("totalLiabilities")) return;
  const current = outputByCode.get("totalCurrentLiabilities");
  const nonCurrent = outputByCode.get("totalNonCurrentLiabilities");
  const template = current ?? nonCurrent;
  if (!template) return;
  outputByCode.set("totalLiabilities", {
    ...template,
    lineCode: "totalLiabilities",
    label: "负债合计",
    code: null,
    section: "liabilities",
    amount: money((current?.amount ?? 0) + (nonCurrent?.amount ?? 0)),
    previousAmount: money((current?.previousAmount ?? 0) + (nonCurrent?.previousAmount ?? 0)),
    sourceAmount: money((current?.sourceAmount ?? 0) + (nonCurrent?.sourceAmount ?? 0)),
    previousSourceAmount: money(
      (current?.previousSourceAmount ?? current?.previousAmount ?? 0)
      + (nonCurrent?.previousSourceAmount ?? nonCurrent?.previousAmount ?? 0),
    ),
    adjustmentAmount: money((current?.adjustmentAmount ?? 0) + (nonCurrent?.adjustmentAmount ?? 0)),
    previousAdjustmentAmount: money(
      (current?.previousAdjustmentAmount ?? 0) + (nonCurrent?.previousAdjustmentAmount ?? 0),
    ),
    entityAmounts: combinedEntityAmounts(current, nonCurrent),
    isHeader: false,
    isTotal: false,
    isGrandTotal: true,
  });
  const equityIndex = orderedCodes.findIndex((lineCode) => outputByCode.get(lineCode)?.section === "equity");
  orderedCodes.splice(equityIndex >= 0 ? equityIndex : orderedCodes.length, 0, "totalLiabilities");
}
