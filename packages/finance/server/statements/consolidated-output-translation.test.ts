import assert from "node:assert/strict";
import test from "node:test";

import { monthlyTranslatedAmount } from "./consolidated-output-translation";

test("CAD cumulative flow amounts sum monthly CNY amounts rounded to cents", () => {
  const flows = ["2026-01-31", "2026-02-28"].map((periodEnd) => ({ periodEnd, lines: [{ lineCode: "revenue", amount: 0.01 }] }));
  const rates = new Map(flows.map(({ periodEnd }) => [periodEnd, 1.5]));
  const result = monthlyTranslatedAmount(flows, rates, "revenue");
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  assert.equal(result.data.currentMonthAmount, 0.02);
  assert.equal(result.data.translatedAmount, 0.04);
});
