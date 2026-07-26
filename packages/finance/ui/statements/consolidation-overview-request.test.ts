import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationOverview } from "@workspace/finance/types";
import { consolidationOverviewMatchesSelection } from "./consolidation-overview-request";

function overview(input: { year: number; month: number; periodKind: "year" | "quarter" | "month"; batchId?: number | null }) {
  return {
    scope: {
      parentCompanyId: 1,
      year: input.year,
      month: input.month,
      periodKind: input.periodKind,
    },
    batch: input.batchId ? { id: input.batchId } : null,
  } as ConsolidationOverview;
}

test("rejects a late response from the previous period kind", () => {
  assert.equal(consolidationOverviewMatchesSelection(
    overview({ year: 2025, month: 12, periodKind: "month", batchId: 4 }),
    { parentCompanyId: 1, year: 2025, month: 12, periodKind: "year", batchId: null },
  ), false);
});

test("rejects a batch response outside the selected precise scope", () => {
  assert.equal(consolidationOverviewMatchesSelection(
    overview({ year: 2025, month: 12, periodKind: "year", batchId: 4 }),
    { parentCompanyId: 1, year: 2025, month: 12, periodKind: "year", batchId: 7 },
  ), false);
});

test("accepts the server-resolved default scope before a precise period exists", () => {
  assert.equal(consolidationOverviewMatchesSelection(
    overview({ year: 2026, month: 6, periodKind: "month", batchId: null }),
    { parentCompanyId: null, year: null, month: null, periodKind: "month", batchId: null },
  ), true);
});
