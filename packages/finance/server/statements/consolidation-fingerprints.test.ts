import assert from "node:assert/strict";
import test from "node:test";

import {
  consolidationFingerprint,
  consolidationRateFingerprint,
  consolidationSourceFactFingerprint,
} from "./consolidation-fingerprints";

test("canonical fingerprints ignore JSON object key order", () => {
  assert.equal(
    consolidationFingerprint({ b: 1, a: { d: 2, c: 3 } }),
    consolidationFingerprint({ a: { c: 3, d: 2 }, b: 1 }),
  );
});

test("source fingerprints survive jsonb key reordering", () => {
  const source = {
    companyId: 1,
    reportType: "balanceSheet",
    sourceKind: "system",
    sourceStatus: "available",
    workpaperId: null,
    workpaperVersion: null,
    sourceChecksum: null,
    workpaperUpdatedBy: null,
    sourcePackageId: null,
    sourcePackageRevision: null,
    sourcePackageStatus: null,
    sourcePackageChecksum: null,
    sourcePackageUploadedBy: null,
    sourcePackageSubmittedBy: null,
    lineCount: 1,
    sourcedLineCount: 1,
    importedLineCount: 0,
    manualLineCount: 0,
    formulaLineCount: 0,
    evidence: "总账核对",
  };
  assert.equal(
    consolidationSourceFactFingerprint({ ...source, reportPayload: { type: "balance", lines: [{ code: "cash", amount: 100 }] } }),
    consolidationSourceFactFingerprint({ ...source, reportPayload: { lines: [{ amount: 100, code: "cash" }], type: "balance" } }),
  );
});

test("rate fingerprints ignore application order and jsonb key order", () => {
  const rate = {
    exchangeRateId: 10,
    exchangeRateVersion: 2,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "historicalInvestment",
    rateDate: "2025-03-15",
    rate: 5.12,
    sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
    publishedAt: "2025-03-15T01:00:00.000Z",
    verifiedBy: 9,
    verifiedAt: "2025-03-16T01:00:00.000Z",
  };
  assert.equal(
    consolidationRateFingerprint([{ ...rate, applications: [{ b: 2, a: 1 }, { y: 2, x: 1 }] }]),
    consolidationRateFingerprint([{ ...rate, applications: [{ x: 1, y: 2 }, { a: 1, b: 2 }] }]),
  );
});
