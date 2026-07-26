import assert from "node:assert/strict";
import test from "node:test";

import { deriveCapitalEventValuation } from "./capital-event-valuation";

test("capital increase valuation is derived from consideration and registered capital", () => {
  const valuation = deriveCapitalEventValuation({
    eventType: "capital_increase",
    registeredCapitalBeforeYuan: 80_000_000,
    registeredCapitalAfterYuan: 98_000_000,
    transactions: [
      {
        registeredCapitalAmountYuan: 8_000_000,
        considerationAmountYuan: 40_000_000,
      },
      {
        registeredCapitalAmountYuan: 10_000_000,
        considerationAmountYuan: 50_000_000,
      },
    ],
  });

  assert.deepEqual(valuation, {
    kind: "primary",
    pricedRegisteredCapitalYuan: 18_000_000,
    totalConsiderationYuan: 90_000_000,
    pricePerRegisteredCapitalYuan: 5,
    preMoneyValuationYuan: 400_000_000,
    postMoneyValuationYuan: 490_000_000,
  });
});

test("secondary transfer derives one implied valuation without increasing company capital", () => {
  const valuation = deriveCapitalEventValuation({
    eventType: "transfer",
    registeredCapitalBeforeYuan: 112_879_600,
    registeredCapitalAfterYuan: 112_879_600,
    transactions: [{
      registeredCapitalAmountYuan: 7_529_000,
      considerationAmountYuan: 120_060_000,
    }],
  });

  assert.equal(valuation?.kind, "secondary");
  assert.equal(valuation?.totalConsiderationYuan, 120_060_000);
  assert.ok(Math.abs((valuation?.preMoneyValuationYuan ?? 0) - 1_800_016_572.72) < 0.01);
  assert.equal(valuation?.postMoneyValuationYuan, valuation?.preMoneyValuationYuan);
});

test("non-priced events do not fabricate a valuation", () => {
  assert.equal(deriveCapitalEventValuation({
    eventType: "capital_reduction",
    registeredCapitalBeforeYuan: 100,
    registeredCapitalAfterYuan: 80,
    transactions: [{
      registeredCapitalAmountYuan: 20,
      considerationAmountYuan: null,
    }],
  }), null);
});

test("a partially priced round does not fabricate a complete valuation", () => {
  assert.equal(deriveCapitalEventValuation({
    eventType: "capital_increase",
    registeredCapitalBeforeYuan: 80_000_000,
    registeredCapitalAfterYuan: 98_000_000,
    transactions: [
      {
        registeredCapitalAmountYuan: 8_000_000,
        considerationAmountYuan: 40_000_000,
      },
      {
        registeredCapitalAmountYuan: 10_000_000,
        considerationAmountYuan: null,
      },
    ],
  }), null);
});
