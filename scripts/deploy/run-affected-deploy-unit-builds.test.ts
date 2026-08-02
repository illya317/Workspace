import assert from "node:assert/strict";
import test from "node:test";

import { createAffectedDeployUnitBuildPlan } from "./run-affected-deploy-unit-builds";

test("a private Finance change builds only Finance after contributor removal", () => {
  const plan = createAffectedDeployUnitBuildPlan(["packages/finance/server/ledger.ts"]);
  assert.deepEqual(plan.affectedUnitIds, ["finance"]);
  assert.deepEqual(plan.buildUnitIds, ["finance"]);
  assert.equal(plan.fullGraphFanout, false);
});

test("Core and unknown changes select all independently buildable units", () => {
  for (const changedFile of ["packages/core/ui/PageSurface.tsx", "unclassified/runtime.ts"]) {
    const plan = createAffectedDeployUnitBuildPlan([changedFile]);
    assert.equal(plan.buildUnitIds.length, 13);
    assert.equal(plan.fullGraphFanout, true);
  }
});

test("documentation-only changes produce no deploy-unit build", () => {
  const plan = createAffectedDeployUnitBuildPlan(["docs/engineering/checks.md"]);
  assert.deepEqual(plan.buildUnitIds, []);
});
