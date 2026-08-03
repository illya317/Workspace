import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationOverview } from "@workspace/finance/types";
import {
  consolidationPreparationAction,
  nextConsolidationLifecycleAction,
  statementLineOptions,
} from "./consolidation-workbench-model";

test("preparation can restart from the latest locked or published batch", () => {
  assert.equal(consolidationPreparationAction(null), "create");
  assert.equal(consolidationPreparationAction("draft"), "complete");
  assert.equal(consolidationPreparationAction("submitted"), null);
  assert.equal(consolidationPreparationAction("reviewed"), null);
  assert.equal(consolidationPreparationAction("locked"), "createVersion");
  assert.equal(consolidationPreparationAction("published"), "createVersion");
});

test("lifecycle exposes one auditable next action", () => {
  assert.equal(nextConsolidationLifecycleAction("draft"), "lock");
  assert.equal(nextConsolidationLifecycleAction("submitted"), "review");
  assert.equal(nextConsolidationLifecycleAction("reviewed"), "lock");
  assert.equal(nextConsolidationLifecycleAction("locked"), "publish");
  assert.equal(nextConsolidationLifecycleAction("published"), null);
});

test("statement line choices exclude headers and derived totals", () => {
  const batch = {
    sources: [{
      reportType: "balanceSheet",
      reportPayload: { payload: { assets: [
        { lineCode: "cash", label: "货币资金", side: "debit", section: "currentAssets" },
        { lineCode: "totalAssets", label: "资产总计", side: "debit", section: "nonCurrentAssets", isGrandTotal: true },
      ] } },
    }],
  } as unknown as NonNullable<ConsolidationOverview["batch"]>;
  assert.deepEqual(statementLineOptions(batch, "balanceSheet"), [{
    value: "cash",
    label: "货币资金 · cash",
    reportType: "balanceSheet",
    side: "debit",
  }]);
});
