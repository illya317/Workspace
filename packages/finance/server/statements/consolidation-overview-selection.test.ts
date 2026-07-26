import assert from "node:assert/strict";
import test from "node:test";

import {
  selectDefaultConsolidationParentId,
  selectLatestCompleteConsolidationPeriod,
} from "./consolidation-overview-selection";

test("default consolidation parent is the top-level controller, not an intermediate company", () => {
  assert.equal(selectDefaultConsolidationParentId([
    { parentId: 1, childId: 3 },
    { parentId: 1, childId: 6 },
    { parentId: 3, childId: 2 },
    { parentId: 2, childId: 5 },
  ]), 1);
});

test("default period skips a current month that only has balance facts", () => {
  const factPeriods = [
    { companyCode: "ZX01", year: 2026, month: 7, _count: { balances: 10, vouchers: 0, cashFlowAllocations: 0 } },
    { companyCode: "ZX02", year: 2026, month: 7, _count: { balances: 10, vouchers: 0, cashFlowAllocations: 0 } },
    { companyCode: "ZX01", year: 2026, month: 6, _count: { balances: 10, vouchers: 2, cashFlowAllocations: 1 } },
    { companyCode: "ZX02", year: 2026, month: 6, _count: { balances: 10, vouchers: 3, cashFlowAllocations: 2 } },
  ];
  assert.deepEqual(selectLatestCompleteConsolidationPeriod({
    companyCodes: ["ZX01", "ZX02"],
    factPeriods,
    availablePeriods: [{ year: 2026, month: 7 }, { year: 2026, month: 6 }],
    today: new Date("2026-07-23T00:00:00Z"),
  }), { year: 2026, month: 6 });
});

test("a period without system cash flow allocation is not complete", () => {
  assert.equal(selectLatestCompleteConsolidationPeriod({
    companyCodes: ["ZX01"],
    factPeriods: [{ companyCode: "ZX01", year: 2026, month: 7, _count: { balances: 10, vouchers: 2, cashFlowAllocations: 0 } }],
    availablePeriods: [{ year: 2026, month: 7 }],
    today: new Date("2026-07-23T00:00:00Z"),
  }), null);
});
