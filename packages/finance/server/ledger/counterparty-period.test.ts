import assert from "node:assert/strict";
import test from "node:test";

import {
  counterpartyPeriodLabel,
  counterpartyPeriodScope,
  counterpartyPeriodValidationMessage,
} from "./counterparty-period";

test("parses and validates counterparty period scopes", () => {
  assert.deepEqual(counterpartyPeriodScope({ year: 2026, month: 6, periodKind: "quarter" }), {
    ok: true,
    data: { year: 2026, month: 6, periodKind: "quarter" },
  });
  assert.deepEqual(counterpartyPeriodScope({ year: 2026, month: 6 }), {
    ok: true,
    data: { year: 2026, month: 6, periodKind: "month" },
  });
  assert.equal(counterpartyPeriodScope({ year: 2026, month: 5, periodKind: "quarter" }).ok, false);
  assert.equal(counterpartyPeriodValidationMessage(2026, 11, "year"), "年度必须选择12月作为期末");
});

test("formats the selected annual, quarterly, and monthly periods", () => {
  assert.equal(counterpartyPeriodLabel(2026, 12, "year"), "2026年度");
  assert.equal(counterpartyPeriodLabel(2026, 6, "quarter"), "2026年第2季度");
  assert.equal(counterpartyPeriodLabel(2026, 6, "month"), "2026.06");
});
