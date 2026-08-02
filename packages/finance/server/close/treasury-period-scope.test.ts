import assert from "node:assert/strict";
import test from "node:test";

import {
  bankAccountAppliesToClosePeriod,
  cancelledLoanNeedsCloseReview,
  loanAppliesToClosePeriod,
} from "./treasury-period-scope";

const scope = { companyCode: "C1", year: 2026, month: 6 };

test("bank-account close scope uses opening and closing dates instead of current active state", () => {
  assert.equal(bankAccountAppliesToClosePeriod({ openedOn: "2025-01-01", closedOn: "2026-06-15" }, scope), true);
  assert.equal(bankAccountAppliesToClosePeriod({ openedOn: "2026-07-01", closedOn: null }, scope), false);
  assert.equal(bankAccountAppliesToClosePeriod({ openedOn: null, closedOn: "2026-05-31" }, scope), false);
});

test("historically applicable settled loans remain in close scope", () => {
  assert.equal(loanAppliesToClosePeriod({ startOn: "2025-01-01", endOn: "2026-06-20", status: "settled" }, scope), true);
  assert.equal(loanAppliesToClosePeriod({ startOn: "2026-07-01", endOn: null, status: "active" }, scope), false);
});

test("cancelled loans are retained for explicit review when no cancellation effective date exists", () => {
  assert.equal(cancelledLoanNeedsCloseReview({ startOn: "2026-01-01", endOn: null, status: "cancelled" }, scope), true);
  assert.equal(cancelledLoanNeedsCloseReview({ startOn: "2026-07-01", endOn: null, status: "cancelled" }, scope), false);
});
