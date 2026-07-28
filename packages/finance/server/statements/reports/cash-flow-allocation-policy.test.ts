import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCashFlowAllocationAmount } from "./cash-flow-allocation-policy";

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
