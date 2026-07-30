import assert from "node:assert/strict";
import test from "node:test";

import { voucherBatchPeriodFilter, voucherPeriodFilter } from "./voucher-period";

test("voucher periods expand annual and quarterly selections into month ranges", () => {
  assert.deepEqual(voucherPeriodFilter({ year: 2026, month: 12, periodKind: "year" }), {
    year: 2026,
    month: { gte: 1, lte: 12 },
  });
  assert.deepEqual(voucherPeriodFilter({ year: 2026, month: 6, periodKind: "quarter" }), {
    year: 2026,
    month: { gte: 4, lte: 6 },
  });
  assert.deepEqual(voucherPeriodFilter({ year: 2026, month: 6, periodKind: "month" }), {
    year: 2026,
    month: 6,
  });
});

test("group voucher history includes every batch through the selected period", () => {
  assert.deepEqual(voucherBatchPeriodFilter({
    year: 2026,
    month: 6,
    periodKind: "month",
    voucherPeriodScope: "history",
  }), {
    OR: [
      { year: { lt: 2026 } },
      { year: 2026, month: { lte: 6 } },
    ],
  });
});
