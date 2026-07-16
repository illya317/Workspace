import assert from "node:assert/strict";
import test from "node:test";

import { currentReverseBalanceAmount } from "./reverse-balance";

test("computes the current reverse balance for both natural directions", () => {
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 125.236,
    account: { balanceDirection: "debit" },
  }), 125.24);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 80,
    closingCredit: 0,
    account: { balanceDirection: "credit" },
  }), 80);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 0.01,
    account: { balanceDirection: "debit" },
  }), 0.01);
});

test("rejects zero and natural-side balances", () => {
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 125,
    closingCredit: 0,
    account: { balanceDirection: "debit" },
  }), null);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 0,
    account: { balanceDirection: "credit" },
  }), null);
});
