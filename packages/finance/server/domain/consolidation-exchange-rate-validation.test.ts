import assert from "node:assert/strict";
import test from "node:test";

import { validateStatementExchangeRateReview } from "./consolidation-exchange-rate-validation";

test("exchange-rate evidence cannot be self-reviewed", () => {
  const selfReview = validateStatementExchangeRateReview({ status: "draft", updatedBy: 9 }, 9);
  assert.equal(selfReview.ok, false);

  const independent = validateStatementExchangeRateReview({ status: "draft", updatedBy: 9 }, 10);
  assert.deepEqual(independent, { ok: true, data: { status: "verified" } });
});
