import assert from "node:assert/strict";
import test from "node:test";
import { calculateInventoryValue, calculateIssueCost, calculateMovingWeightedAverage } from "./calculator";

test("moving weighted average preserves remaining unit cost", () => {
  const entries = [{ signedQuantity: 277, unitCost: 23.5 }, { signedQuantity: -26, unitCost: 23.5 }];
  assert.equal(calculateMovingWeightedAverage(entries), 23.5);
  assert.equal(calculateIssueCost(entries), 611);
  assert.equal(calculateInventoryValue(entries), 5898.5);
});

test("imported inventory ending value includes bag and box stock", () => {
  const entries = [
    { signedQuantity: 2020, unitCost: 1.8 },
    { signedQuantity: 277, unitCost: 23.5 },
    { signedQuantity: -26, unitCost: 23.5 },
    { signedQuantity: 80, unitCost: null },
  ];
  assert.equal(calculateInventoryValue(entries), 9534.5);
});
