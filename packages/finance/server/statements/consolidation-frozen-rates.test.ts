import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationRateReferenceSnapshot } from "@workspace/finance/types";

import { hasMonthlyAverageRateEvidence } from "./consolidation-frozen-rates";

function rate(
  id: number,
  value: number,
  application: ConsolidationRateReferenceSnapshot["applications"][number],
): ConsolidationRateReferenceSnapshot {
  return {
    id,
    exchangeRateId: id,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "centralParity",
    rateDate: application.targetDate,
    rate: value,
    sourceUrl: "https://www.chinamoney.com.cn/",
    publishedAt: null,
    recordedBy: 1,
    recordedAt: "2026-01-01T00:00:00.000Z",
    applications: [application],
  };
}

test("monthly average evidence requires an applied flow-average rate", () => {
  const closing = rate(4, 4.8, {
    applicationType: "closing",
    periodBasis: "current",
    entitySnapshotId: 5,
    voucherItemId: null,
    targetDate: "2026-06-30",
    evidence: "fixture",
    voucher: null,
  });
  const monthlyAverage = {
    ...rate(5, 4.9, {
      applicationType: "flowAverage",
      periodBasis: "current",
      entitySnapshotId: 5,
      voucherItemId: null,
      targetDate: "2026-06-30",
      evidence: "fixture",
      voucher: null,
    }),
    rateKind: "monthlyAverage" as const,
  };

  assert.equal(hasMonthlyAverageRateEvidence([closing]), false);
  assert.equal(hasMonthlyAverageRateEvidence([closing, monthlyAverage]), true);
});
