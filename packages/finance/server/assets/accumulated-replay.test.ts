import assert from "node:assert/strict";
import test from "node:test";
import { replayAssetAccumulatedAmounts } from "./accumulated-replay";

const voucher = {
  id: 9, status: "posted", companyCode: "ZX02", periodId: 6, totalDebit: 100, totalCredit: 100,
  items: [{ accountCode: "6602", debit: 100, credit: 0 }, { accountCode: "1602", debit: 0, credit: 100 }],
};

test("opening cutoff excludes facts already included in the opening amount", () => {
  const result = replayAssetAccumulatedAmounts({
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 500,
    openingAsOfDate: "2026-05-31",
    priorEntries: [
      { assetId: 1, normalAmount: 100, status: "posted", periodId: 5, periodEndDate: "2026-05-31", voucher: { ...voucher, periodId: 5 } },
      { assetId: 1, normalAmount: 100, status: "posted", periodId: 6, periodEndDate: "2026-06-30", voucher },
    ],
    priorAdjustments: [{ assetId: 1, amount: 20, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher }],
    priorImpairments: [{ assetId: 1, amount: 50, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher }],
  });
  assert.equal(result.accumulatedBefore, 620);
  assert.equal(result.impairmentBefore, 50);
  assert.deepEqual(result.blockers, []);
  assert.match(result.basisFingerprint, /^[a-f0-9]{64}$/);
});

test("replay fails closed on an undated opening and unposted historical facts", () => {
  const result = replayAssetAccumulatedAmounts({
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 500,
    openingAsOfDate: null,
    priorEntries: [{ assetId: 1, normalAmount: 100, status: "calculated", periodId: 5, periodEndDate: "2026-05-31", voucher: null }],
    priorAdjustments: [],
    priorImpairments: [],
  });
  assert.equal(result.blockers.some((item) => item.includes("缺少同公司同期间")), true);
});

test("replay blocks a confirmed historical adjustment without an asset allocation", () => {
  const result = replayAssetAccumulatedAmounts({
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 0,
    openingAsOfDate: null,
    priorEntries: [],
    priorAdjustments: [{ assetId: null, amount: 20, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher }],
    priorImpairments: [],
  });
  assert.match(result.blockers[0] ?? "", /未分配到具体资产/);
});

test("impairment before the opening depreciation cutoff remains in the carrying basis", () => {
  const result = replayAssetAccumulatedAmounts({
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 500,
    openingAsOfDate: "2026-05-31",
    priorEntries: [],
    priorAdjustments: [],
    priorImpairments: [{ assetId: 1, amount: 80, status: "confirmed", periodId: 4, periodEndDate: "2026-04-30", voucher: { ...voucher, periodId: 4 } }],
  });
  assert.equal(result.impairmentBefore, 80);
});

test("legacy cutover carries opening impairment once and replays only later impairment", () => {
  const result = replayAssetAccumulatedAmounts({
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 500,
    openingImpairmentAmount: 80,
    openingIncludesImpairment: true,
    openingAsOfDate: "2026-06-30",
    priorEntries: [],
    priorAdjustments: [],
    priorImpairments: [
      { assetId: 1, amount: 80, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher },
      { assetId: 1, amount: 20, status: "confirmed", periodId: 7, periodEndDate: "2026-07-31", voucher: { ...voucher, periodId: 7 } },
    ],
  });
  assert.equal(result.impairmentBefore, 100);
});

test("historical voucher items are revalidated and included in the replay fingerprint", () => {
  const base = {
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 0,
    openingAsOfDate: null,
    priorEntries: [{ assetId: 1, normalAmount: 100, status: "posted", periodId: 6, periodEndDate: "2026-06-30", voucher }],
    priorAdjustments: [],
    priorImpairments: [],
  };
  const valid = replayAssetAccumulatedAmounts(base);
  const changedLine = replayAssetAccumulatedAmounts({
    ...base,
    priorEntries: [{
      ...base.priorEntries[0]!,
      voucher: { ...voucher, items: [{ ...voucher.items[0]!, accountCode: "6601" }, voucher.items[1]!] },
    }],
  });
  assert.deepEqual(valid.blockers, []);
  assert.notEqual(valid.basisFingerprint, changedLine.basisFingerprint);

  const mismatchedHeader = replayAssetAccumulatedAmounts({
    ...base,
    priorEntries: [{
      ...base.priorEntries[0]!,
      voucher: { ...voucher, items: [{ ...voucher.items[0]!, debit: 90 }, voucher.items[1]!] },
    }],
  });
  assert.equal(mismatchedHeader.blockers.some((item) => item.includes("凭证事实")), true);

  const oneCentMismatch = replayAssetAccumulatedAmounts({
    ...base,
    priorEntries: [{
      ...base.priorEntries[0]!,
      voucher: { ...voucher, items: [{ ...voucher.items[0]!, debit: 99.99 }, voucher.items[1]!] },
    }],
  });
  assert.equal(oneCentMismatch.blockers.some((item) => item.includes("凭证事实")), true);
});

test("replay fingerprint is stable across fact and voucher-line ordering", () => {
  const voucherA = { ...voucher, id: 10, periodId: 5 };
  const voucherB = { ...voucher, id: 11, periodId: 6 };
  const input = {
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 0,
    openingAsOfDate: null,
    priorEntries: [
      { assetId: 1, normalAmount: 10, status: "posted", periodId: 5, periodEndDate: "2026-05-31", voucher: voucherA },
      { assetId: 1, normalAmount: 20, status: "posted", periodId: 6, periodEndDate: "2026-06-30", voucher: voucherB },
    ],
    priorAdjustments: [
      { assetId: 1, amount: 3, status: "confirmed", periodId: 5, periodEndDate: "2026-05-31", voucher: voucherA },
      { assetId: 1, amount: 4, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher: voucherB },
    ],
    priorImpairments: [
      { assetId: 1, amount: 1, status: "confirmed", periodId: 5, periodEndDate: "2026-05-31", voucher: voucherA },
      { assetId: 1, amount: 2, status: "confirmed", periodId: 6, periodEndDate: "2026-06-30", voucher: voucherB },
    ],
  };
  const ordered = replayAssetAccumulatedAmounts(input);
  const permuted = replayAssetAccumulatedAmounts({
    ...input,
    priorEntries: [...input.priorEntries].reverse().map((row) => ({ ...row, voucher: { ...row.voucher, items: [...row.voucher.items].reverse() } })),
    priorAdjustments: [...input.priorAdjustments].reverse().map((row) => ({ ...row, voucher: { ...row.voucher, items: [...row.voucher.items].reverse() } })),
    priorImpairments: [...input.priorImpairments].reverse().map((row) => ({ ...row, voucher: { ...row.voucher, items: [...row.voucher.items].reverse() } })),
  });
  assert.equal(ordered.basisFingerprint, permuted.basisFingerprint);
  const changed = replayAssetAccumulatedAmounts({ ...input, priorAdjustments: [{ ...input.priorAdjustments[0]!, amount: 3.01 }, input.priorAdjustments[1]!] });
  assert.notEqual(ordered.basisFingerprint, changed.basisFingerprint);
});

test("replay blockers are canonical and deduplicated across invalid fact permutations", () => {
  const invalidEntries = [
    { assetId: 1, normalAmount: 10, status: "draft", periodId: 5, periodEndDate: "2026-05-31", voucher: null },
    { assetId: 1, normalAmount: 20, status: "calculated", periodId: 4, periodEndDate: "2026-04-30", voucher: null },
    { assetId: 1, normalAmount: 30, status: "draft", periodId: 3, periodEndDate: "2026-03-31", voucher: null },
  ];
  const input = {
    assetId: 1,
    companyCode: "ZX02",
    openingAccumulatedAmount: 0,
    openingAsOfDate: null,
    priorEntries: invalidEntries,
    priorAdjustments: [],
    priorImpairments: [],
  };
  const ordered = replayAssetAccumulatedAmounts(input);
  const permuted = replayAssetAccumulatedAmounts({ ...input, priorEntries: [...invalidEntries].reverse() });
  assert.deepEqual(ordered.blockers, [...new Set(ordered.blockers)].sort((left, right) => left.localeCompare(right)));
  assert.deepEqual(ordered.blockers, permuted.blockers);
  assert.equal(ordered.basisFingerprint, permuted.basisFingerprint);
});
