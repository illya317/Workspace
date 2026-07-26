import assert from "node:assert/strict";
import test from "node:test";

import { amountCurrencyPrefix, amountNumberPresentation } from "./AmountCell";

test("amount cells retain the sign of negative financial values", () => {
  assert.equal(amountCurrencyPrefix(-1234.5, "¥"), "-¥");
  assert.equal(amountCurrencyPrefix(1234.5, "¥"), "¥");
});

test("amount cells render displayed zero as bare zero", () => {
  assert.deepEqual(amountNumberPresentation(0, "¥", 2, 2), {
    currencyPrefix: "",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  assert.deepEqual(amountNumberPresentation(12.5, "¥", 2, 2), {
    currencyPrefix: "¥",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});
