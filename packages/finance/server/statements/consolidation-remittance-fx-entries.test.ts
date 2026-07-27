import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { buildRemittanceFxEntries } from "./consolidation-remittance-fx-entries";

function batch(rate: number, bookedAmountCny: number): ConsolidationBatchSnapshot {
  return {
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "投资方" },
      { id: 2, companyId: 22, companyCode: "C05", companyName: "加拿大主体" },
    ],
    exchangeRates: [{
      id: 7,
      exchangeRateId: 70,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2025-03-14",
      rate,
      sourceUrl: "https://example.test/rate",
      publishedAt: null,
      recordedBy: 9,
      recordedAt: "2025-03-14T08:00:00.000Z",
      applications: [{
        applicationType: "historicalInvestment",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: 101,
        targetDate: "2025-03-14",
        evidence: "发出流水",
        voucher: {
          companyCode: "P01",
          voucherNo: "记-101",
          voucherDate: "2025-03-14",
          description: "汇加拿大投资款",
          accountCode: "1511",
          bookedAmountCny,
          currencyCode: "CAD",
          originalAmount: 100,
        },
      }],
    }],
  } as ConsolidationBatchSnapshot;
}

test("negative remittance difference is an OCI loss on the debit side", () => {
  const [entry] = buildRemittanceFxEntries(batch(5, 520));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /损失/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["capitalReserve", 500, 0],
    ["longTermInvest", 0, 520],
    ["otherComprehensiveIncome", 20, 0],
  ]);
});

test("positive remittance difference is OCI on the credit side", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.2, 500));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /收益/);
  assert.equal(entry?.lines[2]?.credit, 20);
});
