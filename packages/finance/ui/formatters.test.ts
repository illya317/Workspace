import assert from "node:assert/strict";
import test from "node:test";

import { formatFinanceAmount } from "./formatters";

test("finance amount formatter renders rounded zero without decimals", () => {
  assert.equal(formatFinanceAmount(0), "0");
  assert.equal(formatFinanceAmount(null), "0");
  assert.equal(formatFinanceAmount(0.004), "0");
  assert.equal(formatFinanceAmount(12.5), "12.50");
});
