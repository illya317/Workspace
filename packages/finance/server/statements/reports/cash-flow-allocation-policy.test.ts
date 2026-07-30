import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCashFlowPresentationAdjustment,
  normalizeCashFlowAllocationAmount,
} from "./cash-flow-allocation-policy";

const cashDebit = { debit: 7.75, credit: 0, account: { code: "100201" } };
const cashCredit = { debit: 0, credit: 10, account: { code: "100201" } };

test("normalizes imported negative receipts by the actual cash side", () => {
  assert.equal(normalizeCashFlowAllocationAmount({
    amount: -100,
    lineDirection: "in",
    ownerVoucherItem: cashDebit,
    counterpartItem: null,
  }), 100);
});

test("subtracts a receipt mistakenly allocated to an outflow source item", () => {
  assert.equal(normalizeCashFlowAllocationAmount({
    amount: 7.75,
    lineDirection: "out",
    ownerVoucherItem: cashDebit,
    counterpartItem: cashDebit,
  }), -7.75);
  assert.equal(normalizeCashFlowAllocationAmount({
    amount: 10,
    lineDirection: "out",
    ownerVoucherItem: cashCredit,
    counterpartItem: null,
  }), 10);
});

test("moves only the configured presentation amount between cash-flow lines", () => {
  assert.deepEqual(applyCashFlowPresentationAdjustment({
    sourceLineCode: "otherOpOut",
    normalizedAmount: 128.75,
    adjustment: {
      sourceLineCode: "otherOpOut",
      targetLineCode: "staffPayment",
      amount: 39.2,
      enabled: true,
    },
  }), {
    sourceAmount: 89.55,
    targetLineCode: "staffPayment",
    targetAmount: 39.2,
    diagnostic: null,
  });
});
