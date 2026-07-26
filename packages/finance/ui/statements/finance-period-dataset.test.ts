import assert from "node:assert/strict";
import test from "node:test";

import {
  adjacentAvailableFinancePeriod,
  latestAvailableFinancePeriod,
  normalizeFinancePeriodOptions,
} from "./finance-period-dataset";

test("normalizes the shared ledger periods for allowed companies", () => {
  const periods = normalizeFinancePeriodOptions([
    { companyCode: "ZX01", year: 2016, month: 1 },
    { companyCode: "ZX01", year: 2026, month: 8 },
    { companyCode: "ZX01", year: 2026, month: 7 },
    { companyCode: "ZX04", year: 2026, month: 7 },
    { companyCode: null, year: 2026, month: 7 },
  ], ["ZX01", "ZX02"]);

  assert.deepEqual(periods, [
    { companyCode: "ZX01", year: 2026, month: 8 },
    { companyCode: "ZX01", year: 2026, month: 7 },
    { companyCode: "ZX01", year: 2016, month: 1 },
  ]);
  assert.deepEqual(
    latestAvailableFinancePeriod(periods, new Date(2026, 6, 22)),
    { companyCode: "ZX01", year: 2026, month: 7 },
  );
  assert.deepEqual(
    adjacentAvailableFinancePeriod(periods, { year: 2026, month: 7 }, -1),
    { companyCode: "ZX01", year: 2016, month: 1 },
  );
});
