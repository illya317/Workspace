import assert from "node:assert/strict";
import test from "node:test";

import { buildAdjustmentDetails } from "./report-detail";

test("unchanged reclassification does not become a new monthly movement", () => {
  const adjustment = {
    sourceAccountCode: "2221",
    targetAccountCode: "1463",
    amount: 80,
    status: "approved",
  };

  const source = buildAdjustmentDetails(["2221"], [adjustment], [adjustment])[0];
  const target = buildAdjustmentDetails(["1463"], [adjustment], [adjustment])[0];

  assert.deepEqual(source, {
    code: "R-source-2221-1463",
    name: "重分类调整：2221 → 1463",
    category: "reclass",
    balanceDirection: "credit",
    openingDebit: 0,
    openingCredit: 80,
    currentDebit: 0,
    currentCredit: 0,
    closing: -80,
  });
  assert.deepEqual(target, {
    code: "R-target-2221-1463",
    name: "重分类调整：2221 → 1463",
    category: "reclass",
    balanceDirection: "debit",
    openingDebit: 80,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closing: 80,
  });
});
