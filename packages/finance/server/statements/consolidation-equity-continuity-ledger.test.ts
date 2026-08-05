import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapitalEventLedger,
  buildEquityCheckpointLedger,
  equityMoney,
} from "./consolidation-equity-continuity-ledger";

const contributions = [
  ["2019-11-27", 321_462.29, 5.3005],
  ["2020-09-30", 237_350, 5.0864],
  ["2023-08-22", 1_311.6, 5.3928],
  ["2023-09-07", 188_930, 5.3595],
  ["2024-04-25", 51_326.6, 5.214],
  ["2024-05-28", 51_322.8, 5.2393],
  ["2024-08-06", 51_682.39, 5.1658],
  ["2024-12-10", 18_580.98, 5.1025],
  ["2025-01-07", 59_597.71, 5.0495],
  ["2025-07-04", 14_577.1, 5.2751],
  ["2025-07-21", 15_924.47, 5.2152],
  ["2025-08-20", 20_207.27, 5.1615],
  ["2025-09-25", 20_270.21, 5.1261],
  ["2025-10-22", 20_417.06, 5.0721],
  ["2025-11-18", 20_367.61, 5.051],
  ["2025-12-26", 19_921.06, 5.1292],
  ["2026-02-14", 19_865.61, 5.0865],
  ["2026-06-25", 14_846.63, 4.7853],
] as const;

const events = contributions.map(([occurrenceDate, originalAmount, rate], index) => ({
  id: String(index + 1), occurrenceDate, originalAmount, rate,
}));

test("rounds all 18 capital events before cutoff aggregation", () => {
  const prior = buildCapitalEventLedger(events, "2025-12-31");
  const closing = buildCapitalEventLedger(events, "2026-06-30");
  assert.equal(prior.includedEvents.length, 16);
  assert.equal(prior.amountCny, 5_806_818.04);
  assert.equal(closing.includedEvents.length, 18);
  assert.equal(closing.amountCny, 5_978_910.05);
  assert.equal(equityMoney(closing.amountCny - prior.amountCny), 172_092.01);
});

test("builds the certified June checkpoint without a closing-balance plug", () => {
  const checkpoint = buildEquityCheckpointLedger({
    baselineDate: "2026-06-30",
    parentShareRatio: 0.75,
    parentLongTermInvestmentAmount: 6_054_250.60,
    components: [
      { lineCode: "paidInCapital", amount: 505_060 },
      { lineCode: "capitalReserve", amount: 5_978_910.05 },
      { lineCode: "otherComprehensiveIncome", amount: 18_240.65 },
      { lineCode: "undistributedProfit", amount: -8_569_397.02 },
    ],
  });
  assert.equal(checkpoint.consolidatedCapitalReserveAdjustment, -1_191_273.06);
  assert.equal(checkpoint.nci, -516_796.59);
  assert.deepEqual(checkpoint.components.map((item) => [item.lineCode, item.nci]), [
    ["paidInCapital", 126_265],
    ["capitalReserve", 1_494_727.51],
    ["otherComprehensiveIncome", 4_560.16],
    ["undistributedProfit", -2_142_349.26],
  ]);
});
