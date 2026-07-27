import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { buildOpeningCapitalReclassificationEntries } from "./consolidation-opening-capital-reclassification";

const policy = {
  key: "canada-opening-capital-505060",
  foreignCompanyCode: "05",
  sourceCurrencyCode: "CAD" as const,
  sourceOriginalAmount: 100_000,
  payableCounterpartyCompanyCode: "04",
  payableCounterpartyReferenceCode: "505060",
};

function batch(): ConsolidationBatchSnapshot {
  return {
    rateFingerprint: "rate-fingerprint",
    entities: [{ id: 5, companyId: 50, companyCode: "05", companyName: "加拿大主体" }],
    exchangeRates: [{
      id: 1,
      exchangeRateId: 10,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2019-12-31",
      rate: 5,
      sourceUrl: "https://example.test/opening-rate",
      publishedAt: null,
      recordedBy: 1,
      recordedAt: "2019-12-31T00:00:00.000Z",
      applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 5,
        voucherItemId: null,
        targetDate: "2020-01-01",
        evidence: "期初资本",
        capitalOriginalAmount: 100_000,
        voucher: null,
      }],
    }, {
      id: 2,
      exchangeRateId: 20,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2020-09-30",
      rate: 6,
      sourceUrl: "https://example.test/later-rate",
      publishedAt: null,
      recordedBy: 1,
      recordedAt: "2020-09-30T00:00:00.000Z",
      applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 5,
        voucherItemId: null,
        targetDate: "2020-09-30",
        evidence: "后续资本",
        capitalOriginalAmount: 100_000,
        voucher: null,
      }],
    }],
  } as ConsolidationBatchSnapshot;
}

test("reclassifies Canada opening paid-in capital to the configured 505060 payable", () => {
  const result = buildOpeningCapitalReclassificationEntries(
    batch(),
    [policy],
    new Map([["04", { id: 40, code: "04", name: "丰华生物制药（江苏）有限责任公司" }]]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const [entry] = result.data;
  assert.equal(entry?.entryType, "reclassification");
  assert.equal(entry?.lines[0]?.lineCode, "paidInCapital");
  assert.equal(entry?.lines[0]?.debit, 550_000);
  assert.equal(entry?.lines[1]?.lineCode, "otherPayables");
  assert.equal(entry?.lines[1]?.accountCode, "2241");
  assert.equal(entry?.lines[1]?.credit, 550_000);
  assert.equal(entry?.lines[1]?.counterpartyCompanyId, 40);
  assert.match(entry?.lines[1]?.note ?? "", /505060/);
});

test("does not invent an opening entry when the configured payable company is missing", () => {
  const result = buildOpeningCapitalReclassificationEntries(batch(), [policy], new Map());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issue.message, /其他应付款单位不存在/);
});
